-- StockSense - Add login_id to profiles

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS login_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_id_unique
ON public.profiles (login_id)
WHERE login_id IS NOT NULL;