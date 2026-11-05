# Paquete para Arch Linux y CachyOS

Paquete precompilado de Messenger El Nacio (`messenger-el-nacio-bin`).

## Instalar el paquete publicado

Descargar `messenger-el-nacio-bin-<versión>-x86_64.pkg.tar.zst` desde la página de releases y ejecutar:

```bash
sudo pacman -U messenger-el-nacio-bin-0.1.1-1-x86_64.pkg.tar.zst
```

## Compilar desde el PKGBUILD

```bash
cd packaging/arch
makepkg -si
```

`makepkg` descarga el binario portable del release correspondiente, verifica su SHA-256 y arma el paquete con el lanzador, el icono y el archivo `.desktop`.

Dependencias de ejecución: `webkit2gtk-4.1`, `gtk3`, `libsoup3`, `openssl`, `glibc` y `gcc-libs`.

## Actualizar la versión

Cambiar `pkgver` en el `PKGBUILD`, actualizar el `sha256sums` del nuevo release y reconstruir:

```bash
makepkg -f
```
