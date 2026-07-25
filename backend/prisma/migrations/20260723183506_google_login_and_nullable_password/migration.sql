-- Cuentas creadas con "Continuar con Google" no tienen contraseña propia.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Identificador estable de Google ("sub"), si la cuenta se vinculó.
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;

CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
