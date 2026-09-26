// Trigger a file download from a string
window.downloadFile = (fileName, contentType, content) => {
    try {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('downloadFile failed', e);
    }
};

// Export a DOM element to PDF. If fitOnePage = true, scale whole element to a single page.
// New: compress (reduce sizes) and hideSelector (hide parts inside the cloned export container).
window.exportElementToPdf = async (
    elementId,
    fileName,
    titleText,
    orientation = 'landscape',
    fitOnePage = false,
    compress = false,
    hideSelector = null,
    marginMm = 6
) => {
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn(`exportElementToPdf: element #${elementId} not found`);
        return;
    }

    const html2pdfFn = typeof window.html2pdf === 'function' ? window.html2pdf : null;
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || null;
    const html2canvasFn = window.html2canvas || null;

    // Header container (for both modes)
    const container = document.createElement('div');
    container.style.fontFamily = 'Arial, sans-serif';

    if (titleText) {
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'baseline';
        header.style.marginBottom = '8px';
        header.style.borderBottom = '1px solid #ccc';
        header.style.paddingBottom = '6px';

        const title = document.createElement('div');
        title.textContent = titleText;
        title.style.fontSize = '16px';
        title.style.fontWeight = '700';

        const date = document.createElement('div');
        date.textContent = new Date().toLocaleString();
        date.style.fontSize = '10px';
        date.style.color = '#666';

        header.appendChild(title);
        header.appendChild(date);
        container.appendChild(header);
    }

    const cloned = el.cloneNode(true);
    container.appendChild(cloned);

    // Apply compression CSS only inside the export container
    if (compress) {
        container.classList.add('export-fit');
        const style = document.createElement('style');
        style.textContent = `
            /* Base shrink */
            .export-fit { font-size: 11px; }
            .export-fit .rz-data-grid table { font-size: 11px; }
            .export-fit .rz-data-grid .rz-cell, 
            .export-fit .rz-data-grid .rz-header-cell { padding: 2px 4px !important; }
            .export-fit .rz-data-grid .rz-header { padding: 2px 4px !important; }

            /* Day buttons tighter and narrower */
            .export-fit .workcalendar-day-btn { 
                width: 56px !important; 
                padding: 2px 4px !important; 
                margin: 1px !important; 
                font-size: 10px !important; 
                line-height: 1.1 !important;
            }

            /* Tighten flex gaps */
            .export-fit [style*="gap: 6px"] { gap: 2px !important; }

            /* Werkkalender (nieuwe opmaak): 4 maanden per rij, kleinere shiftknoppen */
            .export-fit .wc-months { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 6px !important; }
            .export-fit .wc-month { padding: 6px !important; }
            .export-fit .wc-chips { gap: 3px !important; }
            .export-fit .wc-chip { width: 40px !important; height: 34px !important; }
            .export-fit .wc-chip-day { font-size: 11px !important; }
            .export-fit .wc-chip-meta { font-size: 8px !important; }
            .export-fit .wc-summary { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important; }

            /* Hide non-essential visual noise inside export area if present */
            .export-fit .workcalendar-legend { display: none !important; }
            .export-fit .rz-paginator { display: none !important; }
        `;
        container.appendChild(style);
    }

    // Optionally hide parts of the export (e.g., holidays grid)
    if (hideSelector) {
        container.querySelectorAll(hideSelector).forEach(elm => elm && (elm.style.display = 'none'));
    }

    document.body.appendChild(container);

    // If we can't do single-page (no jsPDF/html2canvas), fall back to html2pdf default multi-page
    if (fitOnePage && (!jsPDFCtor || !html2canvasFn)) {
        console.warn('Single-page export not available (jsPDF/html2canvas missing). Falling back to multi-page.');
        fitOnePage = false;
    }

    const ori = (typeof orientation === 'string' && (orientation === 'landscape' || orientation === 'portrait'))
      ? orientation
      : 'landscape';

    if (!fitOnePage && html2pdfFn) {
        // Multi-page (default html2pdf flow)
        const opt = {
            margin: marginMm,
            filename: fileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: ori },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        try {
            await html2pdfFn().set(opt).from(container).save();
        } finally {
            container.remove();
        }
        return;
    }

    // Single-page fit using html2canvas + jsPDF
    try {
        const pdf = new jsPDFCtor({ orientation: ori, unit: 'mm', format: 'a4' });

        // mm sizes of A4
        const pageWidthMm = ori === 'landscape' ? 297 : 210;
        const pageHeightMm = ori === 'landscape' ? 210 : 297;

        const headerMm = titleText ? 12 : 0;

        // Render high-res canvas of the container
        const canvas = await html2canvasFn(container, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');

        const availWidthMm = pageWidthMm - 2 * marginMm;
        const availHeightMm = pageHeightMm - (2 * marginMm + headerMm);

        const aspect = canvas.width / canvas.height;
        let renderWidthMm = availWidthMm;
        let renderHeightMm = renderWidthMm / aspect;
        if (renderHeightMm > availHeightMm) {
            renderHeightMm = availHeightMm;
            renderWidthMm = renderHeightMm * aspect;
        }

        // Header text rendered by jsPDF (already visually present; keep for fidelity)
        if (titleText) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(titleText, marginMm, marginMm + 5);
        }

        const x = marginMm + (availWidthMm - renderWidthMm) / 2;
        const y = marginMm + (titleText ? headerMm : 0);

        pdf.addImage(imgData, 'PNG', x, y, renderWidthMm, renderHeightMm);
        pdf.save(fileName);
    } catch (err) {
        console.error('exportElementToPdf (single page) failed', err);
    } finally {
        container.remove();
    }
};

// Probe so C# can verify availability
window.hasExportFns = () =>
    typeof window.exportElementToPdf === 'function' &&
    typeof window.downloadFile === 'function';