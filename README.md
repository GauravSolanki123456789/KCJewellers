ssh root@159.65.145.51

cd /var/www/kcjewellers
git fetch --all
git reset --hard origin/master
cd client
rm -rf .next
npm install
npm run build
pm2 restart all


To add a domain as reseller:
sudo nano /etc/nginx/sites-available/kcjewellers

sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d gauravsoftwares.tech -d www.gauravsoftwares.tech

command to kill one drive error 
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

Database access query :
rm -rf /var/www/kcjewellers/public/uploads/web_products/*

command to access database 
sudo -u postgres psql -d kcjewellers
DELETE FROM web_products WHERE barcode = '100001';

DELETE FROM web_products 
WHERE subcategory_id = 262;

SELECT * FROM web_subcategories;SELECT * FROM web_categories;

# 1. Clean up npm's hidden cache (this can eat gigabytes over time)
npm cache clean --force

# 2. Clear out old PM2 logs
pm2 flush

# 3. Clean up old system journals (keeps only the last 2 days of server logs)
sudo journalctl --vacuum-time=2d

# 4. Remove unused Ubuntu packages
sudo apt-get autoremove -y
sudo apt-get clean

## ?? License
Proprietary - Gaurav Softwares
---
