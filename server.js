const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./vocab.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'vocab-secret', resave: false, saveUninitialized: true }));

db.serialize(async () => {
    // 修正：在 word TEXT 後面加上 UNIQUE，確保資料庫永遠不會有重複的英文單字
    db.run(`CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS Words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT UNIQUE, pos TEXT, meaning TEXT, difficulty INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS Records (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, word_id INTEGER, date TEXT, passed BOOLEAN)`);

    const hashedAdminPw = await bcrypt.hash('Andyho0710', 10);
    db.run(`INSERT OR IGNORE INTO Users (username, password_hash, role) VALUES ('andyho0710', ?, 'admin')`, [hashedAdminPw]);

    const words = [
        ['apple', 'n', '蘋果', 1], ['run', 'v', '跑步', 1], ['happy', 'adj', '快樂的', 1],
        ['abandon', 'v', '放棄', 3], ['benevolent', 'adj', '仁慈的', 5], ['catalyst', 'n', '催化劑', 6],
        ['dilemma', 'n', '進退兩難', 4], ['eloquent', 'adj', '雄辯的', 5], ['fluctuate', 'v', '波動', 4],
        ['genuine', 'adj', '真實的', 3], ['harmony', 'n', '和諧', 2], ['inevitable', 'adj', '無可避免的', 4]
    ];
    words.forEach(w => {
        db.run(`INSERT OR IGNORE INTO Words (word, pos, meaning, difficulty) VALUES (?, ?, ?, ?)`, w);
    });
});

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO Users (username, password_hash, role) VALUES (?, ?, 'user')`, [username, hash], function(err) {
        if (err) return res.status(400).json({ error: '用戶名已存在' });
        res.json({ success: true });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM Users WHERE username = ?`, [username], async (err, user) => {
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.role = user.role;
            res.json({ success: true, role: user.role, username: user.username });
        } else {
            res.status(401).json({ error: '帳號或密碼錯誤' });
        }
    });
});

// 修正：確保每日抽出的 10 個單字不重複，並過濾掉已經完全過關的字
app.get('/api/daily-words', (req, res) => {
    if (!req.session.userId) return res.status(401).send('未登入');
    db.all(`SELECT * FROM Words ORDER BY RANDOM() LIMIT 10`, [], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/submit-record', (req, res) => {
    const { word_id, passed } = req.body;
    const date = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO Records (user_id, word_id, date, passed) VALUES (?, ?, ?, ?)`, 
        [req.session.userId, word_id, date, passed]);
    res.json({ success: true });
});

app.get('/api/my-records', (req, res) => {
    db.all(`SELECT w.word, w.meaning, w.pos, r.date FROM Records r JOIN Words w ON r.word_id = w.id WHERE r.user_id = ? AND r.passed = 1`, 
        [req.session.userId], (err, rows) => res.json(rows));
});

app.get('/api/admin/data', (req, res) => {
    if (req.session.role !== 'admin') return res.status(403).send('權限不足');
    db.all(`SELECT u.username, w.word, r.date FROM Records r JOIN Users u ON r.user_id = u.id JOIN Words w ON r.word_id = w.id`, [], (err, rows) => res.json(rows));
});

app.listen(3000, () => console.log('伺服器運行於 http://localhost:3000'));