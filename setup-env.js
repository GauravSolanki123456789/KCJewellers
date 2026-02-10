// Helper script to create .env file
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('📝 Database Configuration Setup\n');
console.log('Please provide your PostgreSQL credentials:\n');

const questions = [
    { key: 'DB_HOST', default: 'localhost', prompt: 'Database Host' },
    { key: 'DB_PORT', default: '5432', prompt: 'Database Port' },
    { key: 'DB_USER', default: 'postgres', prompt: 'Database User' },
    { key: 'DB_PASSWORD', default: '', prompt: 'Database Password (required)' },
    { key: 'DB_NAME', default: 'jewelry_master', prompt: 'Master Database Name' },
    { key: 'PORT', default: '3000', prompt: 'Server Port' },
    { key: 'SESSION_SECRET', default: 'jewelry_estimation_secret', prompt: 'Session Secret' },
    { key: 'GOOGLE_CLIENT_ID', default: '', prompt: 'Google Client ID' },
    { key: 'GOOGLE_CLIENT_SECRET', default: '', prompt: 'Google Client Secret' },
    { key: 'GOOGLE_CALLBACK_URL', default: 'http://localhost:3000/auth/google/callback', prompt: 'Google Callback URL' }
];

const answers = {};

function askQuestion(index) {
    if (index >= questions.length) {
        // Create .env file
        let envContent = '';
        questions.forEach(q => {
            const value = answers[q.key] || q.default;
            envContent += `${q.key}=${value}\n`;
        });

        fs.writeFileSync('.env', envContent);
        console.log('\n✅ .env file created successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. Make sure PostgreSQL is installed and running');
        console.log('2. Create the master database: psql -U postgres -c "CREATE DATABASE jewelry_master;"');
        console.log('3. Run: npm run setup-db');
        console.log('4. Start server: npm start');
        rl.close();
        return;
    }

    const question = questions[index];
    const prompt = `${question.prompt}${question.default ? ` [${question.default}]` : ''}: `;

    rl.question(prompt, (answer) => {
        answers[question.key] = answer.trim() || question.default;
        askQuestion(index + 1);
    });
}

askQuestion(0);

