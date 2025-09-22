const express = require('express');
const ejs = require('ejs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const app = express();
const AUTH_URL = 'http://172.16.3.237:420/oauth';
const THIS_URL = 'http://localhost:3000/login';

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        const tokenData = req.session.token;

        try {
            // Check if the token has expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (tokenData.exp < currentTime) {
                throw new Error('Token has expired');
            }

            next();
        } catch (err) {
            res.redirect(`${FBJS_URL}/oauth?refreshToken=${tokenData.refreshToken}&redirectURL=${THIS_URL}`);
        }
    } else {
        res.redirect(`/login?redirectURL=${THIS_URL}`);
    }
}

app.use(session({
	secret: 'H1!l!k3$3@0fTH3!^3$',
	resave: false,
	saveUninitialized: false
}));

app.set('view engine', 'ejs');

app.get('/', isAuthenticated, (req, res) => {
	try {
		res.render('index.ejs', { user: req.session.user })
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

app.get('/login', (req, res) => {
	if (req.query.token) {
		let tokenData = jwt.decode(req.query.token);
		req.session.token = tokenData;
		req.session.user = tokenData.username;
		// if (session.user.permissions == 4) {
		// 	res.redirect('/teacher');
		// } else {
			res.redirect('/');
		//}
	} else {
		res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}`);
	};
});

app.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});