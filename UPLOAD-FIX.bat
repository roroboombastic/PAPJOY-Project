@echo off
echo ===========================================
echo PAP-JOY WEBSITE UPLOAD FIX
echo ===========================================
echo.
echo This script helps you upload the correct files to fix the blank page issue.
echo.
echo PROBLEM: You uploaded the React app files instead of the static HTML files.
echo SOLUTION: Upload the static HTML files to public_html/
echo.
echo REQUIRED FILES TO UPLOAD:
echo --------------------------
echo index.html (the new static homepage)
echo script.js (dynamic homepage bundle)
echo style.css
echo All other .html files (cart.html, product.html, etc.)
echo.
echo STEPS:
echo ------
echo 1. Go to: http://papjoy.com/cpanel
echo 2. Login to your Namecheap hosting
echo 3. Click "File Manager"
echo 4. Navigate to "public_html" folder
echo 5. DELETE the current index.html (React version)
echo 6. Upload the NEW index.html (static version)
echo 7. Upload script.js
echo 8. Upload style.css
echo 9. Upload all other .html files
echo 10. Test: http://papjoy.com
echo.
echo DEBUG TEST:
echo -----------
echo First upload debug.html and visit: http://papjoy.com/debug.html
echo This will tell you exactly what's working and what's missing.
echo.
echo If you still get blank page after upload:
echo - Check browser console for errors (F12)
echo - Verify all files uploaded to public_html/
echo - Make sure script.js is uploaded
echo - Try a different browser
echo.
pause