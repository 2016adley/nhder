/*
 * @Author: Jindai Kirin 
 * @Date: 2018-12-15 23:04:25 
 * @Last Modified by: Jindai Kirin
 * @Last Modified time: 2018-12-18 15:37:45
 */

const NHentaiAPI = new(require('nhentai-api'))();
const MultiThread = require('./multi-thread');

const EXT = {
	j: 'jpg',
	p: 'png',
	g: 'gif'
}

/**
 * nhentai解析
 *
 * @class Analysiser
 */
class Analysiser {
	constructor(agent = false) {
		if (agent) this.Axios = require('axios').create({
			httpsAgent: agent
		});
		else this.Axios = require('axios');
	}

	callAPI(url) {
		return this.Axios.get(url).catch(err => {
			if (err.code == 'ECONNRESET') {
				console.error('Connection reset detected.');
				return this.callAPI(url);
			} else {
				throw err;
			}
		});
	}

	/**
	 * 获取单个本子信息
	 *
	 * @param {number} bookID 本子ID
	 * @returns 本子信息
	 * @memberof Analysiser
	 */
	async getBook(bookID) {
		let details = await this.callAPI(NHentaiAPI.bookDetails(bookID)).then(ret => ret.data);
		return parseBookDetails(details);
	}

	/**
	 * 从搜索中获取多个本子信息
	 *
	 * @param {string} query 查询字串
	 * @param {number} [start=1] 起始页数
	 * @param {number} [end=1] 终止页数
	 * @returns 本子信息数组
	 * @memberof Analysiser
	 */
	async getBooksFromSearch(query, start = 1, end = 1, thread = 1) {
		let result = [];

		//first
		console.log(`  [-]\t${'-'.green}/-\tCollecting ` + 'query='.gray + query + ' page='.gray + start);
		let firstSearch = await this.callAPI(NHentaiAPI.search(encodeURI(query), start)).then(ret => ret.data);
		let numPages = firstSearch.num_pages;
		for (let details of firstSearch.result) {
			result.push(parseBookDetails(details));
		}

		//剩余任务队列
		let tasks = [];
		for (let page = start + 1; page <= end && page <= numPages; page++) {
			tasks.push(NHentaiAPI.search(encodeURI(query), page));
		}

		let multiThread = new MultiThread(tasks, thread);
		await multiThread.run((threadID, apiURL, index, total) => new Promise(async resolve => {
			console.log(`  [${threadID}]\t${String(index).green}/${total}\tCollecting ` + 'query='.gray + query + ' page='.gray + (start + index));
			let search = await this.callAPI(apiURL).then(ret => ret.data);
			for (let details of search.result) {
				result.push(parseBookDetails(details));
			}
			resolve();
		}));

		return result;
	}
}

/**
 * 解析本子信息
 *
 * @param {*} details 本子原始JSON
 * @returns 本子信息
 */
function parseBookDetails(details) {
	let {
		id,
		images: {
			pages
		},
		media_id,
		num_pages,
		tags,
		title: {
			english,
			japanese,
			pretty
		}
	} = details;

	//图片文件名
	let parsePages = [];
	for (let i = 0; i < pages.length; i++) {
		let t = pages[i].t;
		if (!EXT[t]) throw new Error(`Unknown page type ${t}.`);
		parsePages.push(`${i+1}.${EXT[t]}`);
	}

	//语言Tag
	let language = '';
	for (let tag of tags) {
		if (tag.type == 'language' && tag.name != 'translated') {
			language = tag.name;
			break;
		}
	}

	let prePretty = english.split(pretty)[0];
	if (prePretty == english) prePretty = '';

	return {
		id,
		media_id,
		title: japanese,
		title_pretty: (prePretty + pretty).replace(/[^0-9a-zA-Z]+/g, ' ').trim(),
		language,
		num_pages,
		pages: parsePages
	};
}

module.exports = Analysiser;
