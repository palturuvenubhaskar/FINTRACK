import sys
import PIL
from PIL import Image
import os

input_path = r"C:\Users\PALTURU VENUBHASKAR\.gemini\antigravity-ide\brain\5933deb6-081a-403e-b270-02b3bbcaf90b\.user_uploaded\media_1791399065145.jpg"
output_dir = r"v:\PROJECTS\FINTRACK\FINTRACK\public\icons"
sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512]

print(f"Loading image from {input_path}...")
try:
    img = Image.open(input_path).convert("RGBA")
except Exception as e:
    print(f"Error loading image: {e}")
    sys.exit(1)

width, height = img.size
pixels = img.load()

# For JPEG, white might have compression artifacts, so use a lower threshold
def is_bg(c):
    return c[0] > 230 and c[1] > 230 and c[2] > 230

print("Removing background...")
mask = Image.new('1', (width, height), 0)
mask_pixels = mask.load()

from collections import deque
q = deque([(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)])
visited = set(q)

while q:
    x, y = q.popleft()
    c = pixels[x, y]
    if is_bg(c):
        mask_pixels[x, y] = 1
        for dx, dy in [(1,0), (-1,0), (0,1), (0,-1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                visited.add((nx, ny))
                q.append((nx, ny))

for y in range(height):
    for x in range(width):
        if mask_pixels[x, y]:
            pixels[x, y] = (255, 255, 255, 0)

print("Cropping and resizing...")
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

# Force exactly 512x512
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)

os.makedirs(output_dir, exist_ok=True)

print("Generating icons...")
for size in sizes:
    resized = img_512.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(os.path.join(output_dir, f"icon-{size}.png"))
    if size == 16:
        resized.save(os.path.join(output_dir, f"favicon-16.png"))
    if size == 32:
        resized.save(os.path.join(output_dir, f"favicon-32.png"))

img_512.save(os.path.join(output_dir, f"apple-touch-icon.png"))
img_512.save(os.path.join(output_dir, f"icon-maskable-512.png"))

print("Icons generated successfully!")
