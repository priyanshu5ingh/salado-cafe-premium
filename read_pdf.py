import sys
try:
    import pypdf
    from pypdf import PdfReader
    reader = PdfReader(r"C:\Users\priya\Downloads\NON VEG & VEG  MENU CARD Standard Bengaluru (1).pdf")
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    print(text.strip())
except ImportError:
    print("pypdf completely missing, trying PyMuPDF (fitz)")
    try:
        import fitz
        doc = fitz.open(r"C:\Users\priya\Downloads\NON VEG & VEG  MENU CARD Standard Bengaluru (1).pdf")
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        print(text.strip())
    except Exception as e:
        print(f"Failed to read PDF: {e}")
except Exception as e:
    print(f"Error: {e}")
