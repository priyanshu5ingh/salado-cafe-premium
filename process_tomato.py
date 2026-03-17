import os
from PIL import Image

def remove_background(image_path, output_path, tolerance=5):
    img = Image.open(image_path).convert("RGBA")
    data = img.getdata()

    new_data = []
    # Identify background color (assuming top-left pixel is background)
    bg_color = data[0]

    for item in data:
        # Check if the pixel color is closed to the background color
        if (abs(item[0] - bg_color[0]) < tolerance and
            abs(item[1] - bg_color[1]) < tolerance and
            abs(item[2] - bg_color[2]) < tolerance):
            # Change background to transparent
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path)

input_dir = r"C:\Users\priya\.gemini\antigravity\brain\d061d3c0-4f4d-4f67-8264-758c1f5e4bbd"
output_dir = r"C:\Users\priya\Downloads\salado website\images"

tomato = os.path.join(input_dir, "floating_cherry_tomato_1773766157611.png")

remove_background(tomato, os.path.join(output_dir, "floating_tomato.png"), tolerance=50)

print("Cherry tomato processed and saved to images folder.")
