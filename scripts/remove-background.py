"""Runs only in Forge's isolated runtime. No downloads or system installations."""
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
os.environ['OMP_NUM_THREADS'] = '2'

def create_mask(image):
    """The U²-Net preprocessing used by rembg's u2netp session, without rembg."""
    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    original_size = image.size
    resized = image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS)
    pixels = np.asarray(resized, dtype=np.float32)
    pixels /= max(float(np.max(pixels)), 1e-6)
    pixels = (pixels - (0.485, 0.456, 0.406)) / (0.229, 0.224, 0.225)
    tensor = np.expand_dims(pixels.transpose(2, 0, 1), 0).astype(np.float32)
    session = ort.InferenceSession(str(ROOT / 'models/u2netp.onnx'), providers=['CPUExecutionProvider'])
    prediction = session.run(None, {session.get_inputs()[0].name: tensor})[0][0, 0]
    low, high = float(prediction.min()), float(prediction.max())
    if high <= low: raise RuntimeError('Le modèle de détourage a renvoyé un masque invalide.')
    alpha = ((prediction - low) / (high - low) * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(alpha, mode='L').resize(original_size, Image.Resampling.LANCZOS)

def main():
    # Refuse a missing model; the runner never has a download path.
    if not (ROOT / 'models/u2netp.onnx').is_file():
        raise RuntimeError('Le modèle de détourage intégré est manquant.')
    from PIL import Image, ImageOps
    if sys.argv[1:] == ['--check']:
        import numpy, onnxruntime
        print(json.dumps({'success': True, 'python': sys.version.split()[0], 'engine': onnxruntime.__version__}))
        return
    source, destination = map(Path, sys.argv[1:])
    if source.resolve() == destination.resolve():
        raise ValueError('La sortie doit être différente du fichier original.')
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGBA')
        result = image.copy()
        # Keep any transparency already present in the original.
        from PIL import ImageChops
        result.putalpha(ImageChops.multiply(create_mask(image), image.getchannel('A')))
        fd, temporary = tempfile.mkstemp(prefix='.forge-cutout-', suffix='.png', dir=destination.parent)
        os.close(fd)
        try:
            result.save(temporary, format='PNG')
            os.replace(temporary, destination)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(json.dumps({'success': True}))

if __name__ == '__main__':
    main()
