import * as pdfjsLib from "./assets/pdfjs/pdf.mjs";

const pdfUrl = new URL("CV.pdf", document.baseURI).href;
const viewer = document.querySelector("[data-pdf-viewer]");

pdfjsLib.GlobalWorkerOptions.workerSrc = "./assets/pdfjs/pdf.worker.mjs";

let pdfDocument = null;
let renderId = 0;
let resizeTimer = 0;

const getViewerWidth = () => {
    const width = viewer.getBoundingClientRect().width;
    return Math.max(280, Math.floor(width));
};

const createLinkOverlay = (annotation, viewport) => {
    if (!annotation.url || !Array.isArray(annotation.rect)) {
        return null;
    }

    const [x1, y1, x2, y2] = annotation.rect;
    const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
    const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
    const left = Math.min(vx1, vx2);
    const top = Math.min(vy1, vy2);
    const width = Math.abs(vx1 - vx2);
    const height = Math.abs(vy1 - vy2);

    const link = document.createElement("a");
    link.className = "pdf-link";
    link.href = annotation.url;
    link.setAttribute("aria-label", annotation.contentsObj?.str || annotation.url);
    link.style.left = `${left}px`;
    link.style.top = `${top}px`;
    link.style.width = `${width}px`;
    link.style.height = `${height}px`;

    if (/^https?:\/\//i.test(annotation.url)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }

    return link;
};

const renderPage = async (pageNumber, availableWidth) => {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: availableWidth / baseViewport.width });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);

    const pageElement = document.createElement("section");
    pageElement.className = "pdf-page";
    pageElement.setAttribute("aria-label", `Page ${pageNumber} of ${pdfDocument.numPages}`);
    pageElement.style.width = `${Math.floor(viewport.width)}px`;
    pageElement.style.height = `${Math.floor(viewport.height)}px`;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    pageElement.append(canvas);

    const annotationsPromise = page.getAnnotations({ intent: "display" });

    const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

    await page.render({
        canvasContext: context,
        transform,
        viewport,
    }).promise;

    annotationsPromise
        .then(annotations => {
            for (const annotation of annotations) {
                const link = createLinkOverlay(annotation, viewport);
                if (link) {
                    pageElement.append(link);
                }
            }
        })
        .catch(console.error);

    return pageElement;
};

const renderDocument = async () => {
    if (!pdfDocument) {
        return;
    }

    const currentRenderId = ++renderId;
    const fragment = document.createDocumentFragment();
    const width = getViewerWidth();

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const pageElement = await renderPage(pageNumber, width);
        if (currentRenderId !== renderId) {
            return;
        }

        fragment.append(pageElement);
    }

    viewer.replaceChildren(fragment);
    viewer.classList.add("is-loaded");
};

const queueRender = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        renderDocument().catch(showError);
    }, 150);
};

const showError = error => {
    console.error(error);

    const fallback = document.createElement("p");
    const link = document.createElement("a");
    fallback.className = "pdf-fallback";
    fallback.append("Unable to load ");
    link.href = "CV.pdf";
    link.textContent = "CV.pdf";
    fallback.append(link, ".");

    viewer.replaceChildren(fallback);
    viewer.classList.add("is-loaded");
};

try {
    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
    pdfDocument = await loadingTask.promise;
    await renderDocument();
    window.addEventListener("resize", queueRender);
} catch (error) {
    showError(error);
}
