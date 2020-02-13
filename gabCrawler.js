const express = require('express');
const cors = require('cors');
const CSVToJSON = require('csvtojson');
const JSONToCSV = require('json2csv');
const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');

// Init app
const app = express();

//Load View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Set public folder

app.use(express.static(path.join(__dirname, 'public')));

// TESTING PUG

app.get('/', (req, res) => {
	res.render('index', { title: 'Welcome to Gab Group Crawler!' });
});

app.use(cors());
const baseURL = 'https://www.gab.com/';
const userAuth = {
	email: 'bengat167@gmail.com',
	password: 'gabpassword167'
};

// save mined group
saveMinedGroup = (group) => {
	if (group.groupName != '') {
		CSVToJSON().fromFile('./groups.csv').then((source) => {
			source.push({
				Index: group.Index,
				URL: group.URL,
				Name: group.Name,
				Description: group.Description,
				Image: group.Image,
				LatestPostCreator: group.LatestPostCreator,
				LatestPostDate: group.LatestPostDate,
				LatestPostContent: group.LatestPostContent
			});
			const csv = JSONToCSV.parse(source, {
				fields: [
					'Index',
					'URL',
					'Name',
					'Description',
					'Image',
					'LatestPostCreator',
					'LatestPostDate',
					'LatestPostContent'
				]
			});
			fs.writeFileSync('./groups.csv', csv);
		});
	}
};

// Mine groups index screen
app.get('/mineGroups', async (req, res) => {
	var currentIndex = 1;
	currentIndex = await CSVToJSON().fromFile('./groups.csv').then((source) => {
		if (source.length > 0) {
			return parseInt(source[source.length - 1].Index) + 1;
		} else return 1;
	});
	res.render('mineGroupsSearch', {
		title: 'Current index is: ' + currentIndex + '.'
	});
});

// Start group mining from latest index
app.get('/mineGroups/:stopIndex', async (req, res) => {
	try {
		console.log('entered multiple func');
		let startIndex = 1;
		startIndex = await CSVToJSON().fromFile('./groups.csv').then((source) => {
			if (source.length > 0) {
				return parseInt(source[source.length - 1].Index) + 1;
			} else return 1;
		});
		var stopIndex = parseInt(req.params.stopIndex) + startIndex - 1;
		// set browser up and log in
		const browser = await puppeteer.launch({
			args: [ '--enable-resource-load-scheduler=false', '--disable-background-timer-throttling' ],
			headless: true
		});
		const page = await browser.newPage();
		page.setDefaultTimeout(20000);
		page.setUserAgent(
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
		);
		console.log('page is up');
		await page.goto(baseURL + 'auth/sign_in');
		console.log('in page');
		await page.waitForSelector('.email');
		await page.type('input[name="user[email]"]', userAuth.email);
		await page.type('input[name="user[password]"]', userAuth.password);
		await (await page.$('button')).click();
		await page.waitForNavigation();
		console.log('logged in');
		// JSON for group data
		let groups = [];
		var currentIndex = startIndex;
		// Currently mines only 10 groups at a time!!!!!!! can go infinitly if we set otherwise
		while (currentIndex <= stopIndex) {
			let groupData = {
				Index: currentIndex,
				URL: baseURL + 'groups/' + currentIndex,
				Name: '',
				Description: '',
				Image: '',
				LatestPostCreator: '',
				LatestPostDate: '',
				LatestPostContent: ''
			};
			try {
				page.goto(baseURL + 'groups/' + currentIndex);
				await new Promise((resolve) => setTimeout(resolve, 4000));
				let doesGroupExist = await page.$('.group__panel__title');
				if (doesGroupExist) {
					await page.waitForSelector('h1.group__panel__title');
					// Get Basic group data
					groupData.Name = await page.$eval('.group__panel__title', (el) => el.textContent);
					groupData.Description = await page.$eval('.group__panel__description', (el) => el.textContent);
					// Letting groups with no image take the default src to then become undefined by the split method for later rendering
					groupData.Image = await page.$eval('.parallax', (el) => el.getAttribute('src'));
					// Some groups don't have any posts up
					// Here we eliminate dealing with these cases
					// By checking the length of the current list
					// If it's loading or there is no group the length will be <15
					// Anything else will be longer due to the site's post template
					// If it's empty we set '' to all post parameter
					// Else we fill out the posts details
					let loading = await page.$eval('div.slist', (el) => el.textContent);
					while (loading.length < 15) {
						await new Promise((resolve) => setTimeout(resolve, 4000));
						loading = await page.$eval('div.slist', (el) => el.textContent);
					}
					// Checking if there are no posts
					let hasPosts = await page.$('.empty-column-indicator');
					// If there are - collect data
					if (hasPosts === null) {
						groupData.LatestPostCreator = await page.$$eval(
							'.display-name__html',
							(el) => el[0].textContent
						);
						groupData.LatestPostDate = await page.$$eval(
							'a.status__relative-time',
							(el) => el[0].textContent
						);
						groupData.LatestPostContent = await page.$$eval('.status__content', (el) => el[0].textContent);
					}
				}
				saveMinedGroup(groupData);
				currentIndex++;
				groups.push(groupData);
			} catch (err) {
				console.log(err);
			}
		}
		res.render('minedGroups', {
			title: 'Mined Groups',
			groups: groups
		});
		await page.close();
		await browser.close();
	} catch (err) {
		console.log(err);
	}
});

// Get all groups from csv file
app.get('/getAllMinedGroups', (req, res) => {
	CSVToJSON().fromFile('./groups.csv').then((source) => {
		res.render('minedGroups', {
			title: 'Mined Groups',
			groups: source
		});
	});
});

// Download CSV file
app.get('/downloadCSV', (req, res) => {
	const file = `${__dirname}/groups.csv`;
	res.download(file);
});

// Mine group search screen
app.get('/mineGroup', (req, res) => {
	res.render('mineGroupSearch', {
		title: 'Enter group index to mine:'
	});
});

// mines and returns a group in specific index
app.get('/mineGroup/:index', async (req, res) => {
	// mine group in index and send details
	var groupIndex = req.params.index;
	// set browser up and log in
	const browser = await puppeteer.launch({
		args: [ '--enable-resource-load-scheduler=false', '--disable-background-timer-throttling' ],
		headless: true
	});
	const page = await browser.newPage();
	page.setDefaultTimeout(20000);
	page.setUserAgent(
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
	);
	console.log('page is up');
	await page.goto(baseURL + 'auth/sign_in');
	console.log('in page');
	await page.waitForSelector('.email');
	await page.type('input[name="user[email]"]', userAuth.email);
	await page.type('input[name="user[password]"]', userAuth.password);
	await (await page.$('button')).click();
	await page.waitForNavigation();
	console.log('logged in');
	// JSON for group data
	let groupData = {
		groupIndex: groupIndex,
		groupURL: baseURL + 'groups/' + groupIndex,
		groupName: '',
		groupDescription: '',
		groupImage: '',
		latestPostCreator: '',
		latestPostDate: '',
		latestPostContent: ''
	};
	try {
		page.goto(baseURL + 'groups/' + groupIndex);
		await new Promise((resolve) => setTimeout(resolve, 4000));
		let doesGroupExist = await page.$('.group__panel__title');
		if (doesGroupExist) {
			await page.waitForSelector('h1.group__panel__title');
			// Get Basic group data
			groupData.groupName = await page.$eval('.group__panel__title', (el) => el.textContent);
			groupData.groupDescription = await page.$eval('.group__panel__description', (el) => el.textContent);
			// Letting groups with no image take the default src to then become undefined by the split method for later rendering
			groupData.groupImage = await page.$eval('.parallax', (el) => el.getAttribute('src'));
			// Some groups don't have any posts up
			// Here we eliminate dealing with these cases
			// By checking the length of the current list
			// If it's loading or there is no group the length will be <15
			// Anything else will be longer due to the site's post template
			// If it's empty we set '' to all post parameter
			// Else we fill out the posts details
			let loading = await page.$eval('div.slist', (el) => el.textContent);
			while (loading.length < 15) {
				await new Promise((resolve) => setTimeout(resolve, 4000));
				loading = await page.$eval('div.slist', (el) => el.textContent);
			}
			// Checking if there are no posts
			let hasPosts = await page.$('.empty-column-indicator');
			// If there are - collect data
			if (hasPosts === null) {
				groupData.latestPostCreator = await page.$$eval('.display-name__html', (el) => el[0].textContent);
				groupData.latestPostDate = await page.$$eval('a.status__relative-time', (el) => el[0].textContent);
				groupData.latestPostContent = await page.$$eval('.status__content', (el) => el[0].textContent);
			}
		}
		await page.close();
		await browser.close();
	} catch (err) {
		console.log(err);
	}
	res.render('mineGroup', {
		title: 'Index: ' + groupIndex,
		group: groupData
	});
});

// server is listening on localhost:4000
app.listen(4000, () => {
	console.log('group server listening');
});
