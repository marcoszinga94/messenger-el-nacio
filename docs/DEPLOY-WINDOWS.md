# Despliegue en Windows

Guía para dejar el servidor y el panel funcionando en una PC Windows de la institución.

## 1. Requisitos

- Windows 10/11 o Windows Server 2019/2022.
- Node 24 LTS (solo hace falta `node.exe` si usás el bundle ya compilado).
- Acceso de administrador para crear tareas programadas y reglas de firewall.
- IP fija o reserva DHCP para la PC servidor.
- Puerto 443 redirigido en el router (y 80 si no usás IIS).

## 2. Estructura recomendada

```
C:\MessengerElNacio\
  node\node.exe
  server\index.js
  admin\index.html
  admin\assets\...
  caddy\caddy.exe
  caddy\Caddyfile
  data\                (base SQLite y secreto JWT)
  logs\
  start-server.cmd
  start-caddy.cmd
```

## 3. Variables del servidor

El proceso lee variables de entorno o un archivo `.env` en el directorio de trabajo:

| Variable | Ejemplo |
| --- | --- |
| `PORT` | `3000` |
| `HOST` | `0.0.0.0` |
| `DATA_DIR` | `C:\MessengerElNacio\data` |
| `ADMIN_DIST` | `C:\MessengerElNacio\admin` |
| `ADMIN_USER` | `administrador` |
| `ADMIN_PASSWORD` | contraseña inicial, cambiar al entrar |
| `PUBLIC_URL` | `https://messenger.example.com` |
| `RELEASES_URL` | `https://github.com/USUARIO/messenger-el-nacio/releases/latest` |
| `RETENTION_DAYS` | `30` |

`ADMIN_PASSWORD` solo se usa cuando la base está vacía. Después se cambia desde el panel.

## 4. Arranque automático

Opción simple con el Programador de tareas:

```powershell
schtasks /Create /TN "MessengerElNacio" /TR "C:\MessengerElNacio\start-server.cmd" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
```

Para reinicio automático ante caídas se recomienda [NSSM](https://nssm.cc/) o WinSW.

## 5. HTTPS con Caddy

Si el puerto 80 está ocupado por IIS, se puede emitir el certificado con `tls-alpn-01` usando solo el 443:

```
{
    storage file_system "C:/MessengerElNacio/caddy/data"
    auto_https disable_redirects
}

messenger.example.com {
    encode gzip
    tls {
        issuer acme {
            disable_http_challenge
        }
    }
    reverse_proxy 127.0.0.1:3000
}
```

Redirigir en el router el puerto **443** hacia la PC servidor. Si la IP pública es dinámica, usar DuckDNS o un dominio con DDNS.

## 6. Firewall

```powershell
New-NetFirewallRule -DisplayName "Messenger El Nacio HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Any
New-NetFirewallRule -DisplayName "Messenger El Nacio LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -RemoteAddress 192.168.1.0/24 -Profile Any
```

No exponer el puerto 3000 a internet: solo Caddy debe ser público.

## 7. Backups

La base es SQLite en modo WAL. Hacer una copia diaria con la API de backup:

```powershell
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('C:/MessengerElNacio/data/messenger.db'); db.exec(\"VACUUM INTO 'C:/MessengerElNacio/backups/messenger-' || strftime('%Y%m%d','now') || '.db'\");"
```

Programar con el Programador de tareas y conservar al menos 14 copias.

## 8. Actualizaciones

1. Compilar el servidor (`pnpm --filter @nacio/server build`) y el panel (`pnpm --filter @nacio/admin build`).
2. Reemplazar `server/index.js` y la carpeta `admin`.
3. Reiniciar la tarea `MessengerElNacio`.

La base se migra sola al arrancar.

## 9. Seguridad

- Cambiar la contraseña inicial del administrador.
- No exponer RDP a internet; usar VPN o restringir por IP.
- Mantener Windows y Node actualizados.
- Revisar la retención del historial y avisar a los alumnos.
- Hacer backups antes de cada actualización.
