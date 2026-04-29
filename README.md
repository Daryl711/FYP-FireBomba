# Fire Detection and Early Warning for Sarawak Longhouse


## To run this project, please do the following:

```git clone https://github.com/Daryl711/FYP-FireBomba```

Locate to the directory that contains the repository that you have downloaded.

### Frontend:

#### Prerequisite: 
Must download EXPO GO in your phone.

```cd frontend```

Install dependencies:

```npm install```

**IMPORTANT:** 
Please create an .env file that contains the following:

```EXPO_PUBLIC_API_URL=http://[your_ip_address]:3000```

The laptop must be in the same network as your phone.

#### To run:

```npm run start```

Then scan the QR code using EXPO GO that is shown in the terminal.

### Backend:

#### Prerequiste:
Must download XAMPP in your laptop.

#### Steps to Setup Database in localhost:
1. Start Apache and MySQL in the XAMPP
2. Open the admin page by using localhost/phpmyadmin
3. Go to the IMPORT tab, and import the sql file that is contained in backend > sql > database.sql.

Then navigate to your backend using
```cd backend```.

Install dependencies:

```npm install```

**IMPORTANT:** 
Please create an .env file that contains the following:

```JWT_SECRET = [some random string]```

```JWT_EXPIRES_IN = 15m```

Then run by using:

```npm run start```




