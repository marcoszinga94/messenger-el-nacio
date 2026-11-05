# Paquete para Arch Linux y CachyOS

Paquete precompilado de Messenger El Nacio (`messenger-el-nacio-bin`).

## Instalar el paquete publicado

Descargar `Messenger.El.Nacio-<versión>-Linux-Arch-CachyOS-x86_64.pkg.tar.zst` desde la página de releases y ejecutar:

```bash
sudo pacman -U Messenger.El.Nacio-0.1.2-Linux-Arch-CachyOS-x86_64.pkg.tar.zst
```

## Compilar desde el PKGBUILD

```bash
cd packaging/arch
makepkg -si
```

`makepkg` descarga el binario portable del release correspondiente, verifica su SHA-256 y arma el paquete con el lanzador, el icono y el archivo `.desktop`.

Dependencias de ejecución: `webkit2gtk-4.1`, `gtk3`, `libsoup3`, `openssl`, `glibc`, `gcc-libs` y `gst-plugins-good`.

`gst-plugins-good` es necesario para los sonidos y zumbidos: sin él, WebKitGTK puede abortar al reproducir audio. El paquete lo instala automáticamente con pacman.

## Nombre del archivo publicado

El paquete que genera `makepkg` usa el nombre estándar de Arch. Para publicarlo con el nombre descriptivo del resto de los instaladores, renombrarlo después de compilar:

```bash
makepkg -f
mv messenger-el-nacio-bin-0.1.2-1-x86_64.pkg.tar.zst \
   Messenger.El.Nacio-0.1.2-Linux-Arch-CachyOS-x86_64.pkg.tar.zst
```

## Actualizar la versión

Cambiar `pkgver` en el `PKGBUILD`, actualizar el `sha256sums` del nuevo release y reconstruir:

```bash
makepkg -f
```
