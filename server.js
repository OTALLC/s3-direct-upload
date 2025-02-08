// server.js

const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const session = require('express-session');
const axios = require('axios'); // Used for posting the webhook notification.
const path = require('path');

const app = express();

app.use('/public', express.static(path.join(__dirname, 'public')));

// Configure multer to store uploaded files in memory.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// AWS S3 Configuration
// Ensure that AWS_REGION and S3_BUCKET_NAME are set in your environment.
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  signatureVersion: 'v4' // Force signature version 4, which is required in many regions.
});

// Log configuration details.
console.log("AWS Region:", process.env.AWS_REGION);
console.log("S3 Bucket Name:", process.env.S3_BUCKET_NAME);

// Set up session middleware.
// In production, use a secure secret and consider a persistent session store.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'defaultsecret',
    resave: false,
    saveUninitialized: false,
  })
);

// Parse URL-encoded bodies.
app.use(express.urlencoded({ extended: false }));

// ------------------------
// Public Routes (No auth required)
// ------------------------

// Login page.
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login submission.
app.post('/login', (req, res) => {
  const passcode = req.body.passcode;
  if (passcode === process.env.PASSCODE) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  // If login fails, send the login page again.
  res.send(`
    <h2>Login</h2>
    <p style="color:red;">Invalid passcode.</p>
    <form method="POST" action="/login">
      <label>
        Passcode:
        <input type="password" name="passcode" required />
      </label>
      <button type="submit">Submit</button>
    </form>
  `);
});

// Logout route (does not require auth).
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ------------------------
// Global Authentication Middleware
// ------------------------
// For every request except /login and /logout, require authentication.
app.use((req, res, next) => {
  // Allow access to /login and /logout without authentication.
  if (req.path === '/login' || req.path === '/logout') {
    return next();
  }
  // Optionally, add other public paths here (e.g., a health check)
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.redirect('/login');
});

// ------------------------
// Protected Routes and Static Assets
// ------------------------

// Serve static files from the public directory (now behind authentication).
app.use(express.static(path.join(__dirname, 'public')));

// Serve the upload page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle file uploads.
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    console.error("No file was uploaded.");
    return res.status(400).send('No file uploaded.');
  }

  // Generate a unique filename by appending a timestamp to the original filename.
  const extension = path.extname(file.originalname);
  const basename = path.basename(file.originalname, extension);
  const uniqueFileName = `${basename}-${Date.now()}${extension}`;
  console.log("Unique filename generated:", uniqueFileName);

  // Define S3 upload parameters using the unique filename.
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: uniqueFileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  console.log("S3 upload params:", JSON.stringify(params));

  // Upload file to S3.
  s3.upload(params, (err, data) => {
    if (err) {
      console.error('Error uploading file:', err);
      return res.status(500).send('Error uploading file.');
    }

    console.log("S3 upload result:", data);

    // Use the returned key from the upload result if available; otherwise, use our unique filename.
    const s3Key = data.Key || uniqueFileName;
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      console.error("Environment variable S3_BUCKET_NAME is not set!");
      return res.status(500).send('Server configuration error.');
    }

    // Log the values before generating the signed URL.
    console.log("Generating signed URL with Bucket:", bucketName, "Key:", s3Key);

    // Parameters for generating the signed URL.
    const s3Params = {
      Bucket: bucketName,
      Key: s3Key,
      Expires: 300  // URL expires in 300 seconds
    };
    console.log("s3Params for getSignedUrlPromise:", JSON.stringify(s3Params));

    // Use getSignedUrlPromise for promise-based signed URL generation.
    s3.getSignedUrlPromise('getObject', s3Params)
      .then(signedUrl => {
        console.log("Generated signed URL:", signedUrl);
        if (!signedUrl || signedUrl === "https://s3.amazonaws.com/") {
          console.warn("Warning: The generated signed URL appears to be generic:", signedUrl);
        }

        // Create an Adaptive Card payload for Microsoft Teams.
        // INSERT_ other payloads, i.e. Slack, etc. here as needed.
        const teamsPayload = {
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              contentUrl: null,
              content: {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.2",
                "body": [
                  {
                    "type": "TextBlock",
                    "text": "File Upload Notification",
                    "weight": "Bolder",
                    "size": "Large"
                  },
                  {
                    "type": "TextBlock",
                    "text": "A new file has been uploaded.",
                    "wrap": true
                  },
                  {
                    "type": "FactSet",
                    "facts": [
                      {
                        "title": "Team Name",
                        "value": req.body.name || "N/A"
                      },
                      {
                        "title": "Filename:",
                        "value": uniqueFileName
                      }
                    ]
                  }
                ],
                "actions": [
                  {
                    "type": "Action.OpenUrl",
                    "title": "View File",
                    "url": signedUrl
                  }
                ]
              }
            }
          ]
        };

        // Post the Adaptive Card payload to the Microsoft Teams webhook.
        if (process.env.TEAMS_WEBHOOK_URL) {
          axios.post(process.env.TEAMS_WEBHOOK_URL, teamsPayload)
            .then(() => {
              console.log('Webhook sent to Microsoft Teams successfully.');
            })
            .catch(webhookErr => {
              console.error('Error sending webhook to Microsoft Teams:', webhookErr);
            });
        } else {
          console.warn('TEAMS_WEBHOOK_URL is not set. Skipping Teams webhook notification.');
        }

        // Respond to the user.
        res.send(`
          <h2>File uploaded successfully!</h2>
          <p>View it <a href="${signedUrl}" target="_blank">HERE</a></p>
          <p><a href="/">Upload another file</a></p>
        `);
      })
      .catch(err => {
        console.error("Error generating signed URL:", err);
        return res.status(500).send('Error generating signed URL.');
      });
  });
});

// Start the server.
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});