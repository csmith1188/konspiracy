const express = require('express');
const ejs = require('ejs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const app = express();
const bodyParser = require('body-parser');
// const sqlite3 = require('sqlite3');
// const db = new sqlite3.Database('./database.db');

const AUTH_URL = 'http://localhost:420/oauth';
const THIS_URL = 'http://localhost:3000/login';

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
	secret: 'H1!l!k3$3@0fTH3!^3$',
	resave: false,
	saveUninitialized: false
}));

function isAuthenticated(req, res, next) {
	console.log(req.session.user);
	
	if (req.session.user) next()
	else res.redirect('/login')
};

app.set('view engine', 'ejs');

app.get('/', isAuthenticated, (req, res) => {
	try {
		res.render('index.ejs', { user: req.session.user.displayName })
	}
	catch (error) {
		res.send(error.message)
	}
});

app.get('/teacher', isAuthenticated, (req, res) => {
	try {
		res.render('teacher.ejs')
	}
	catch (error) {
		res.send(error.message)
	}
});

app.post('/teacher', (req, res) => {
    const selectedSubject = req.body.subject;

    if (selectedSubject === 'sample_data') {
        res.render('sample_test.ejs', { testName: 'Sample Data Test' });
    } else {
        res.status(400).send('Invalid subject selected');
    }
});

//doesnt work yet used for testing
// app.post('/', (req, res) => { 
// 	const testData = req.body; 

// 	console.log('Received test data:', testData);

// 	res.send('Test data submitted successfully');
// });

app.get('/login', (req, res) => {
	if (req.query.token) {
		try {
			// Decode the token
			const tokenData = jwt.decode(req.query.token);

			if (tokenData && tokenData.id) { // Check for a valid user ID
				// Save user data in the session
				req.session.user = {
					id: tokenData.id,
					email: tokenData.email,
					displayName: tokenData.displayName,
					permissions: tokenData.permissions,
					classrooms: tokenData.classrooms,
				};
				console.log('User session saved:', req.session.user); // Debugging log
				if (tokenData.permissions === 5) {
					return res.redirect('/teacher');
				} else {
					return res.redirect('/');
				}
			} else {
				console.log('Invalid token data:', tokenData); // Debugging log
				return res.status(400).send('Invalid token');
			}
		} catch (error) {
			console.error('Error decoding token:', error.message); // Debugging log
			return res.status(400).send('Error decoding token');
		}
	} else {
		console.log('No token provided, rendering login page'); // Debugging log
		res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}`);
	}
});

app.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});