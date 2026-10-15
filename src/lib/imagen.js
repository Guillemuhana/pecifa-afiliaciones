// Reduce y convierte fotos a JPEG en el navegador (menos peso, sin HEIC/WEBP).

function cargar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/** Devuelve un File JPEG (máx. `max` px del lado mayor). Los PDF se devuelven tal cual. */
export async function prepararArchivo(file, max = 2000, calidad = 0.85) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return new File([file], file.name, { type: 'application/pdf' });
  }
  const { img, url } = await cargar(file);
  try {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', calidad));
    if (!blob) throw new Error('No se pudo convertir la imagen');
    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const esImagen = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
export const esPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const tamano = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
