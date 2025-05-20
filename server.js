require('dotenv').config();
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const Fuse = require('fuse.js');

const app = express();

// Helper to prettify domain names, e.g. "wealth_tech" -> "Wealth Tech"
function prettifyDomain(domain) {
  // Domains like 'bav', 'vkyc', 'ckyc', 'poc' should be all caps
  const allCapsDomains = ['bav', 'vkyc', 'ckyc', 'poc'];
  if (allCapsDomains.includes(domain.toLowerCase())) {
    return domain.toUpperCase();
  }
  return domain
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = Object.fromEntries(new URLSearchParams(data));
    } catch {
      req.body = {};
    }
    next();
  });
});

function verifySlackRequest(req, res, next) {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sigBasestring = `v0:${timestamp}:${req.rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', slackSigningSecret).update(sigBasestring, 'utf8').digest('hex');
  const slackSignature = req.headers['x-slack-signature'];

  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) {
    return res.status(400).send('Ignore this request.');
  }

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    return res.status(400).send('Verification failed');
  }

  next();
}

app.post('/expert', verifySlackRequest, (req, res) => {
  const userInput = req.body.text?.trim().toLowerCase();

  if (!userInput) {
    return res.send('Please provide a domain name.');
  }

  const experts = JSON.parse(fs.readFileSync('./experts.json', 'utf8'));
  const domainKeys = Object.keys(experts);

  const fuse = new Fuse(domainKeys, {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
  });

  const results = fuse.search(userInput);

  if (results.length === 0) {
    return res.send(`😕 Hmm, I couldn't find a Subject Matter Expert for *${userInput}*. Try another domain or check spelling.`);
  }

  const bestMatch = results[0].item;
  const expert = experts[bestMatch];
  const prettyDomain = prettifyDomain(bestMatch);

  const puns = {
    wealth_tech: "He knows it all about Wealth Tech! 💼✨",
    vkyc: "He can handle VKYC in his sleep 😴✅",
    e_sign: "The eSign guru — eSigning deals faster than you can blink! 🖋️⚡",
    lending: "Lending expert who’s got your back (and your loan)! 💸🤝",
    bank_statement_analysis: "Reads bank statements like bedtime stories 📖💰",
    gig_economy: "Master of the gig hustle and flow 🎤💼",
    bav: "Verifying accounts faster than a bank teller! 🏦⚡",
    ckyc: "CKYC champ with the Midas touch ✨🛠️",
    poc: "Proof of Concept? He’s the proof you need! ✔️🔍"
  };

  const punLine = puns[bestMatch] || "A Subject Matter Expert you can always count on! 🚀";

  // Nicely formatted multi-line Slack message
  res.send(
    `:sparkles: *Subject Matter Expert for* _${prettyDomain}_ :rocket:\n\n` +
    `*${expert}*\n\n` +
    `_${punLine}_\n\n` +
    `Need help? Just ping them! :speech_balloon:`
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Slack bot listening on port ${PORT}`);
});
