taskkill /F /IM node.exe 

command to kill one drive error 
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

KCJewellers Digital Ocean Terminal Database access query 
rm -rf /var/www/kcjewellers/public/uploads/web_products/*
command to access database 
sudo -u postgres psql -d kcjewellers
DELETE FROM web_products WHERE barcode = '100001';
ssh root@159.65.145.59


1. Force Git to overwrite everything with your perfect GitHub code:

Bash
cd /var/www/kcjewellers
git fetch --all
git reset --hard origin/master
2. Clean up and build natively for Linux:

Bash
cd client
rm -rf .next
npm install
npm run build

pm2 restart all
pm2 restart all --upadate env


## ?? License
Proprietary - Gaurav Softwares
---

Part 2: Your Admin Masterclass
Now that the engine is running, here is what these features actually do and why they are essential for your business.

1. Manage SIP Plans (The Control Center)
This is where you invent your financial products.

Installment Amount: The exact ₹ value the customer must pay every month.

Duration: How many months they are locked in.

Jeweler Benefit %: This is your "bonus" to the customer for staying loyal. 100 means you give them 100% of one installment amount for free at the very end. 50 means you give them half an installment.

2. Payout Requests (The Ledger)
You only use this if a customer cancels their SIP early, or if your specific plan gives them cash back (which is rare).

If a user hits "Cancel & Withdraw", their money shows up here. You manually UPI/NEFT the money to their bank account, type the UPI Reference Number into the admin_remarks, and click "Mark Paid." It keeps your legal ledger clean.

3. Gold Lot Movements (Your Liability Tracker)
This is incredibly important. When 100 customers pay their ₹2,000 installment today, the database calculates how many grams of gold they just bought at today's Live Rate.

Why you need it: If gold prices skyrocket, you owe those customers that physical weight. This page tells you exactly how many total grams of gold you currently "owe" to your SIP customers so you can hedge your real-world inventory.

Part 3: The 1g 22K Gold Coin Strategy
Using a 1g 22K Gold coin is the perfect entry-level SIP. It is highly attractive to middle-class investors. Here is how you structure it and why it's a win-win.

Let's assume a 1g 22K coin costs roughly ₹7,500 today.

How to set it up in the Modal:

Name: "1g 22K Gold Saver"

Metal Type: Gold

Duration: 10 months

Installment Amount: ₹750

Jeweler Benefit %: 0 or 50 (Coins have very low margins, so you don't want to give away too much free money. A 0% benefit is fine because the customer's main benefit is protecting against price inflation).

The Advantage for the Customer (Cost Averaging):
They don't have ₹7,500 today. They pay you ₹750 a month. Because of your Live Rate engine, if gold crashes next month, their ₹750 buys more milligrams of gold. If gold spikes, they are glad they locked in earlier. It builds wealth safely.

The Advantage for YOU (Working Capital):
You get ₹750 in hard cash today. You can immediately use that capital to buy raw gold for your shop at wholesale prices. By the time month 10 rolls around, you have had 10 months of free working capital, and you just hand them a 1g coin from your inventory.

**Version:** 2.5.0 (Gold Master)  
**Last Updated:** January 2025
