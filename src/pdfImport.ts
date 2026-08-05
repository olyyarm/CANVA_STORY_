import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

const normalizeExtractedText = (value: string) =>
  value
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

export const extractTextFromDocumentFile = async (file: File) => {
  if (file.type === 'application/pdf' || file.name.toLocaleLowerCase('en').endsWith('.pdf')) {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const data = new Uint8Array(await file.arrayBuffer());
    const document = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      pages.push(`Страница ${pageNumber}\n${pageText}`);
    }

    return normalizeExtractedText(pages.join('\n\n'));
  }

  return normalizeExtractedText(await file.text());
};
