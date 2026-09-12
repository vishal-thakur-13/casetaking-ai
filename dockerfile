FROM python:3.11-slim

# Tesseract OCR and system libraries for PyMuPDF/Pillow
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port and run with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "app:app"]