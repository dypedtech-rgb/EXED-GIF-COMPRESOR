# 🎞 GIF Compressor

**Comprime tus GIFs en lote, directamente en el navegador — sin servidor, sin límites, 100% privado.**

Usa **gifsicle** (la misma herramienta profesional de línea de comandos) compilada a WebAssembly para optimizar tus GIFs preservando la calidad visual.

[![Demo en vivo](https://img.shields.io/badge/Demo-GitHub%20Pages-4fc3f7?style=for-the-badge&logo=github)](https://TU_USUARIO.github.io/gif-compressor/)
[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-7c3aed?style=for-the-badge)](LICENSE)
[![Sin backend](https://img.shields.io/badge/Backend-Ninguno-34d399?style=for-the-badge)](.)

---

## ✨ Características

| Característica | Detalle |
|---|---|
| 🔒 **100% privado** | Los GIFs nunca salen de tu dispositivo |
| 📦 **Procesamiento en lote** | Carga y comprime múltiples GIFs a la vez |
| ⚡ **Gifsicle WASM** | Motor profesional de optimización compilado a WebAssembly |
| 🎨 **Preserva calidad** | Optimiza sin re-cuantizar colores, mantiene la calidad visual |
| 📐 **Redimensionado** | Escala el GIF desde 10% hasta 100% |
| 🔧 **Compresión lossy** | Control granular de compresión con pérdida (0–200) |
| 📥 **Descarga en ZIP** | Descarga todos los GIFs comprimidos en un solo archivo |
| 📊 **Estimación en vivo** | Muestra el peso estimado antes de comprimir |

---

## 🚀 Uso

### Opción A – GitHub Pages (recomendado)

1. Haz un fork de este repositorio
2. Ve a **Settings → Pages → Branch: main → / (root)**
3. ¡Listo! Tu app estará en `https://TU_USUARIO.github.io/gif-compressor/`

### Opción B – Local

```bash
git clone https://github.com/TU_USUARIO/gif-compressor.git
cd gif-compressor
python3 -m http.server 8080
```

Abre `http://localhost:8080` en el navegador.

---

## ⚙️ Configuración

| Ajuste | Rango | Descripción |
|---|---|---|
| **Optimización** | O1, O2, O3 | O1=rápido, O2=equilibrado, O3=máximo |
| **Lossy** | 0–200 | 0=lossless, 30-80=recomendado, 200=máx compresión |
| **Escala** | 10%–100% | Redimensiona manteniendo proporción |
| **Colores** | 8–256 | 256=auto (mantiene paleta original) |

---

## 📁 Estructura del proyecto

```
gif-compressor/
├── index.html        # Aplicación principal
├── style.css         # Estilos (dark theme premium)
├── app.js            # Lógica de compresión y UI (ES module)
├── README.md         # Este archivo
└── LICENSE           # MIT
```

---

## 📦 Tecnología

- **[gifsicle-wasm-browser](https://github.com/nickreese/gifsicle-wasm-browser)** — Gifsicle compilado a WebAssembly
- **[JSZip](https://stuk.github.io/jszip/)** — Generación de archivos ZIP
- **Sin build step** — Todo funciona con ES modules y CDN

---

## 📄 Licencia

MIT — Úsalo, modifícalo y compártelo libremente.

---

<div align="center">
  Hecho con ❤️ · Powered by Gifsicle WASM · 100% open source
</div>
