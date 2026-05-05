#!/usr/bin/env python3
"""Extract images from a PDF file and output as JSON with base64-encoded images.

Usage:
    python3 extract_pdf_images.py <pdf_path>

Output: JSON array of objects:
    [{"label": "Image A", "mimeType": "image/jpeg", "data": "<base64>"}]

Exits with code 0 on success, 1 on error, 2 if no images found (still outputs []).
"""

import sys
import json
import base64
import io


def extract_pdf_images(pdf_path: str) -> list[dict]:
    """Extract embedded images from a PDF, returning labeled base64-encoded data."""
    import pdfplumber
    from PIL import Image as PILImage

    images = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for img in page.images:
                stream = img["stream"]
                filters = stream.get_filters()
                filter_names = [f[0].name if hasattr(f[0], "name") else str(f[0]) for f in filters]

                # Determine color space
                colorspace = img.get("colorspace", "")
                if isinstance(colorspace, list):
                    colorspace = colorspace[0].name if hasattr(colorspace[0], "name") else str(colorspace[0])

                width = stream.get("Width", 0)
                height = stream.get("Height", 0)
                if width == 0 or height == 0:
                    srcsize = img.get("srcsize", (0, 0))
                    width = srcsize[0] if len(srcsize) > 0 else 0
                    height = srcsize[1] if len(srcsize) > 1 else 0

                label = f"Image {chr(65 + len(images))}"

                # JPEG: raw stream data IS the JPEG file
                if any("DCTDecode" in str(f) for f in filter_names):
                    raw = stream.get_rawdata()
                    images.append({
                        "label": label,
                        "mimeType": "image/jpeg",
                        "data": base64.b64encode(raw).decode("utf-8"),
                    })

                # JPEG2000: raw stream data IS the JP2 file
                elif any("JPXDecode" in str(f) for f in filter_names):
                    raw = stream.get_rawdata()
                    images.append({
                        "label": label,
                        "mimeType": "image/jp2",
                        "data": base64.b64encode(raw).decode("utf-8"),
                    })

                # FlateDecode (raw pixels): re-encode as PNG
                elif any("FlateDecode" in str(f) for f in filter_names):
                    try:
                        decoded = stream.get_data()
                        # Determine PIL mode from color space and bits
                        n_components = stream.get("BitsPerComponent", 8)
                        if "RGB" in str(colorspace) or "DeviceRGB" in str(colorspace):
                            mode = "RGB"
                        elif "CMYK" in str(colorspace) or "DeviceCMYK" in str(colorspace):
                            mode = "CMYK"
                        elif "Gray" in str(colorspace) or "DeviceGray" in str(colorspace):
                            mode = "L"
                        else:
                            # Default to RGB for unknown color spaces
                            mode = "RGB"

                        pil_img = PILImage.frombytes(mode, (width, height), decoded)

                        # CMYK needs conversion to RGB for display
                        if mode == "CMYK":
                            pil_img = pil_img.convert("RGB")

                        buf = io.BytesIO()
                        pil_img.save(buf, format="PNG")
                        png_data = buf.getvalue()

                        images.append({
                            "label": label,
                            "mimeType": "image/png",
                            "data": base64.b64encode(png_data).decode("utf-8"),
                        })
                    except Exception as e:
                        print(f"Warning: Could not re-encode FlateDecode image: {e}", file=sys.stderr)

                # Other filters: skip with warning
                else:
                    print(f"Warning: Skipping image with unsupported filters: {filter_names}", file=sys.stderr)

    return images


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 extract_pdf_images.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        result = extract_pdf_images(pdf_path)
        print(json.dumps(result))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)