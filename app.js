const express = require('express');
const ejs = require('ejs');
const app = express();
// const sqlite3 = require('sqlite3');
// const db = new sqlite3.Database('./database.db');

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/teacher', (req, res) => {
    res.render('teacher', {

    });
})

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});