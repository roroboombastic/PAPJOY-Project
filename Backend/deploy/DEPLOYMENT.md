# PAPJOY Deployment Guide

## 1. DNS records

Create DNS records for `papjoy.com` and `www.papjoy.com`.

Recommended setup:

- `A` record for `papjoy.com` -> your server public IPv4 address
- `A` record for `www` -> same public IPv4 address

If you have IPv6 support, add matching `AAAA` records.

Alternative:

- `A` record for `papjoy.com`
- `CNAME` record for `www` -> `papjoy.com`

> Important: Use "DNS only" / gray cloud if you want nginx on the server to terminate TLS directly.

## 2. Server filesystem layout

This example assumes:

- frontend static files are served from `/var/www/papjoy`
- backend code is installed in `/var/www/papjoy/backend`

If your repo is deployed elsewhere, update `root` in `nginx-papjoy.conf` and `WorkingDirectory` in `papjoy.service`.

## 3. Backend environment

Create a secure environment file for production:

```bash
sudo mkdir -p /etc/papjoy
sudo nano /etc/papjoy/papjoy.env
```

Example contents:

```env
PORT=5000
APP_URL=https://www.papjoy.com
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/papjoy?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
# add any other required variables from Backend/.env.example
```

Lock it down:

```bash
sudo chown root:www-data /etc/papjoy/papjoy.env
sudo chmod 640 /etc/papjoy/papjoy.env
```

## 4. nginx configuration

Copy `Backend/deploy/nginx-papjoy.conf` to the nginx sites-available folder:

```bash
sudo cp "Backend/deploy/nginx-papjoy.conf" /etc/nginx/sites-available/papjoy
sudo ln -s /etc/nginx/sites-available/papjoy /etc/nginx/sites-enabled/papjoy
```

Then test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. TLS / HTTPS

Use Certbot to obtain certificates:

```bash
sudo certbot --nginx -d papjoy.com -d www.papjoy.com
```

If you are not using Certbot, replace the `ssl_certificate` and `ssl_certificate_key` paths in `nginx-papjoy.conf` with your certificate locations.

## 6. Running the Node backend

Install dependencies and run the backend as a service:

```bash
cd /var/www/papjoy/backend
npm install
sudo cp "Backend/deploy/papjoy.service" /etc/systemd/system/papjoy.service
sudo systemctl daemon-reload
sudo systemctl enable papjoy.service
sudo systemctl start papjoy.service
```

Check status:

```bash
sudo systemctl status papjoy.service
```

## 7. Deploy frontend static files

Copy the frontend files to the nginx root location:

```bash
sudo mkdir -p /var/www/papjoy
sudo cp -r "frontend/*" /var/www/papjoy/
```

If you use the Vite app in `frontend/frontend`, build it and then copy the built assets instead.

## 8. Verify

- Visit `https://papjoy.com`
- Confirm static pages load
- Confirm API calls go to `https://papjoy.com/api/v1...`
- Confirm backend logs show incoming requests and MongoDB connects successfully

## 9. Notes

- The current backend exposes versioned API traffic under `/api/v1` and maintains legacy compatibility for `/api` routes.
- The frontend has been adjusted to use same-origin API requests.
- If you want `papjoy.com` to redirect to `www.papjoy.com`, keep both names in the nginx `server_name` and add a redirect block.
