// server.js - Node.js backend for paper submission with email confirmation
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or use SMTP settings
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS  // App-specific password
  }
});

// Generate submission ID
function generateSubmissionId() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DDI-${year}${month}${day}-${random}`;
}

// Format date for email
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome'
  });
}

// Email templates
function getConfirmationEmailToSubmitter(data, submissionId) {
  return {
    subject: `Submission Received - ${data.paper_title}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e3799; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
    .details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .footer { text-align: center; color: #6c757d; font-size: 12px; margin-top: 20px; }
    h1 { margin: 0; }
    .submission-id { color: #1e3799; font-weight: bold; font-size: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Submission Confirmation</h1>
      <p style="margin: 5px 0;">Data, Algorithms, and Innovation in Firms Workshop</p>
    </div>
    <div class="content">
      <p>Dear ${data.name},</p>
      
      <p>Thank you for submitting your paper to the Data, Algorithms, and Innovation in Firms Workshop. 
      We have successfully received your submission.</p>
      
      <div class="details">
        <p class="submission-id">Submission ID: ${submissionId}</p>
        <p><strong>Paper Title:</strong> ${data.paper_title}</p>
        <p><strong>Submission Type:</strong> ${data.submission_type}</p>
        <p><strong>Institution:</strong> ${data.institution}</p>
        ${data.coauthors ? `<p><strong>Co-authors:</strong> ${data.coauthors}</p>` : ''}
        <p><strong>Submitted on:</strong> ${formatDate(new Date())}</p>
      </div>
      
      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Your submission will be reviewed by our committee</li>
        <li>You will receive a decision notification by December 15, 2025</li>
        <li>If accepted, you will be invited to present at the workshop on January 29-30, 2026 in Venice</li>
      </ul>
      
      <p>If you have any questions, please contact us at ddivenice@gmail.com</p>
      
      <p>Best regards,<br>
      The Organizing Committee</p>
    </div>
    <div class="footer">
      <p>This is an automated confirmation. Please do not reply to this email.</p>
      <p>&copy; 2025 Data, Algorithms, and Innovation in Firms Workshop</p>
    </div>
  </div>
</body>
</html>
    `
  };
}

function getNotificationEmailToOrganizers(data, submissionId, fileName) {
  return {
    subject: `New Paper Submission - ${data.paper_title}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .details { background: #f8f9fa; padding: 15px; border-left: 4px solid #1e3799; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px; vertical-align: top; }
    .label { font-weight: bold; width: 150px; }
  </style>
</head>
<body>
  <h2>New Paper Submission Received</h2>
  
  <div class="details">
    <table>
      <tr><td class="label">Submission ID:</td><td>${submissionId}</td></tr>
      <tr><td class="label">Date/Time:</td><td>${formatDate(new Date())}</td></tr>
      <tr><td class="label">Name:</td><td>${data.name}</td></tr>
      <tr><td class="label">Email:</td><td>${data.email}</td></tr>
      <tr><td class="label">Institution:</td><td>${data.institution}</td></tr>
      <tr><td class="label">Paper Title:</td><td>${data.paper_title}</td></tr>
      <tr><td class="label">Co-authors:</td><td>${data.coauthors || 'None'}</td></tr>
      <tr><td class="label">Submission Type:</td><td>${data.submission_type}</td></tr>
      <tr><td class="label">PDF File:</td><td>${fileName}</td></tr>
    </table>
  </div>
  
  <p>The PDF file has been saved to the server and attached to this email.</p>
</body>
</html>
    `
  };
}

// Submission endpoint
app.post('/submit-paper', upload.single('attachment'), async (req, res) => {
  try {
    const submissionId = generateSubmissionId();
    const formData = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Send confirmation email to submitter
    const confirmationEmail = getConfirmationEmailToSubmitter(formData, submissionId);
    await transporter.sendMail({
      from: `"DDI Workshop" <${process.env.EMAIL_USER}>`,
      to: formData.email,
      ...confirmationEmail
    });
    
    // Send notification to organizers with attachment
    const organizerEmail = getNotificationEmailToOrganizers(formData, submissionId, file.originalname);
    await transporter.sendMail({
      from: `"DDI Workshop Submission System" <${process.env.EMAIL_USER}>`,
      to: 'ddivenice@gmail.com',
      ...organizerEmail,
      attachments: [{
        filename: file.originalname,
        path: file.path
      }]
    });
    
    // Log submission
    const logEntry = {
      submissionId,
      timestamp: new Date().toISOString(),
      ...formData,
      fileName: file.originalname,
      fileSize: file.size
    };
    
    await fs.appendFile(
      'submissions.log', 
      JSON.stringify(logEntry) + '\n'
    );
    
    res.json({ 
      success: true, 
      submissionId,
      message: 'Submission received successfully. Check your email for confirmation.'
    });
    
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ 
      error: 'Failed to process submission. Please try again or contact support.'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Email confirmation system active');
});