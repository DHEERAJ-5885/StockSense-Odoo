import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

/** A tiny in-process SMTP server: records what Nodemailer sends, so no real mail is involved. */
function fakeSmtp() {
  const received = { auth: "", from: "", to: [] as string[], data: "" };
  const server = net.createServer((socket) => {
    let inData = false;
    let buf = "";
    socket.write("220 fake.smtp ESMTP\r\n");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (inData) {
        if (buf.includes("\r\n.\r\n")) {
          received.data = buf.split("\r\n.\r\n")[0];
          buf = "";
          inData = false;
          socket.write("250 queued\r\n");
        }
        return;
      }
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO")) socket.write("250-fake.smtp\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
        else if (cmd.startsWith("AUTH PLAIN")) {
          received.auth = Buffer.from(line.split(" ")[2] ?? "", "base64").toString("utf8").replace(/\0/g, "|");
          socket.write("235 authenticated\r\n");
        } else if (cmd.startsWith("MAIL FROM")) {
          received.from = line;
          socket.write("250 OK\r\n");
        } else if (cmd.startsWith("RCPT TO")) {
          received.to.push(line);
          socket.write("250 OK\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
          if (buf.length) socket.emit("data", Buffer.alloc(0));
        } else if (cmd === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  });
  return { server, received };
}

test("with SMTP configured, the code email goes out through Nodemailer", async () => {
  const { server, received } = fakeSmtp();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as net.AddressInfo).port;

  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "mailer-user";
  process.env.SMTP_PASS = "mailer-pass";
  process.env.MAIL_FROM = "StockSense <noreply@example.test>";

  const { sendResetCodeEmail, mailerMode } = await import("../src/services/mailer");
  assert.equal(mailerMode(), "smtp");
  await sendResetCodeEmail("anya@stocksense.app", "482913");
  server.close();

  assert.equal(received.auth, "|mailer-user|mailer-pass"); // logged in with the configured account
  assert.match(received.from, /noreply@example\.test/);
  assert.match(received.to.join(" "), /anya@stocksense\.app/);
  assert.match(received.data, /Subject: Your StockSense password reset code/);
  assert.match(received.data, /482913/);
  assert.match(received.data, /expires in 10 minutes/);
});
