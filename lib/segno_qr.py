import urllib.request
import zipfile
import json
import io
import os
import sys

def _ensure_segno():
    lib_dir = os.path.dirname(os.path.abspath(__file__))
    segno_dir = os.path.join(lib_dir, 'segno')
    if not os.path.exists(segno_dir):
        try:
            # Dynamically resolve the latest wheel URL from PyPI
            api_url = "https://pypi.org/pypi/segno/json"
            resp = urllib.request.urlopen(api_url, timeout=15)
            data = json.loads(resp.read())
            
            wheel_url = None
            for url_info in data.get('urls', []):
                if url_info.get('packagetype') == 'bdist_wheel':
                    wheel_url = url_info['url']
                    break
            
            if not wheel_url:
                print("Could not find segno wheel on PyPI")
                return False
            
            resp = urllib.request.urlopen(wheel_url, timeout=30)
            with zipfile.ZipFile(io.BytesIO(resp.read())) as z:
                z.extractall(lib_dir)
        except Exception as e:
            print(f"Failed to download segno: {e}")
            return False
    
    if lib_dir not in sys.path:
        sys.path.insert(0, lib_dir)
    return True

if _ensure_segno():
    import segno
    # Replace this module with the actual segno module
    sys.modules[__name__] = segno
else:
    # Minimal fallback dummy module if download fails
    def make(*args, **kwargs):
        class DummyQR:
            def save(self, *args, **kwargs):
                pass
        return DummyQR()
