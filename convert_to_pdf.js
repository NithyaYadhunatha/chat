const puppeteer = require('puppeteer');
const path = require('path');
const { urlToFileSystemPath, pathToFileURL } = require('url');

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        const htmlPath = 'c:/projects/sj4.html';
        const pdfPath = 'c:/projects/sj4_report.pdf';
        
        const fileUrl = pathToFileURL(htmlPath).toString();
        console.log('Loading:', fileUrl);
        
        await page.goto(fileUrl, { waitUntil: 'networkidle0' });
        
        await page.pdf({
            path: pdfPath,
            format: 'Letter',
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: false,
            margin: {
                top: '0in',
                right: '0in',
                bottom: '0in',
                left: '0in'
            }
        });
        
        await browser.close();
        console.log('PDF created successfully at:', pdfPath);
    } catch (error) {
        console.error('Error during PDF conversion:', error);
        process.exit(1);
    }
})();
