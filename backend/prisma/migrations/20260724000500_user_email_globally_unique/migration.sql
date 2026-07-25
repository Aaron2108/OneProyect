-- El login por email se pensó único a nivel global desde el registro
-- (auth.service.ts), pero solo se exigía en código de la aplicación
-- (findFirst + create), con una ventana real de condición de carrera entre
-- dos altas concurrentes con el mismo email en tenants distintos. Se cierra
-- exigiéndolo también en la base de datos.

-- DropIndex
DROP INDEX "users_tenant_id_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
