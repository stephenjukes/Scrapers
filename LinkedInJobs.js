const { equal } = require('assert');
const puppeteer = require('puppeteer');

const isIncluded = (text, terms) => terms.some(term => text.toLowerCase().includes(term));

(async() => {
    const browser = await puppeteer.launch({
        headless: false
    });

    const page = await browser.newPage();

    const baseUrl = 'https://www.linkedin.com/jobs/search/?f_E=2%2C3%2C4&f_F=eng%2Cit&f_I=4&f_JT=F&f_T=9&f_WT=2&geoId=101165590&keywords=c%23&location=United%20Kingdom&sortBy=R';
    const filters = '';
    await page.goto(baseUrl + filters);

    // https://stackoverflow.com/questions/51529332/puppeteer-scroll-down-until-you-cant-anymore
    await page.evaluate(async() => {
        const distance = 8000;
        const delay = 2000;

        while (document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight) {
            document.scrollingElement.scrollBy(0, distance);
            
            const showMoreResultsButton = document.querySelector('button[aria-label="Load more results"]');
            if (showMoreResultsButton) showMoreResultsButton.click();

            await new Promise(resolve => { setTimeout(resolve, delay); });
        }
    })

    const jobs = await page.evaluate(() => {
        const jobPosts = [...document
            .getElementsByTagName('ul')[6]
            .getElementsByTagName('li')
        ];

        const totalPosts = jobPosts
            .map((job, i) => {
                const salaryRegex = /(Up to )?(GBP|£|\$)?\d{2,3}(,\s?\d{3}|K)\s?((-|to)\s?(GBP|£|\$)?\d{2,3}(,\s?\d{3}|K))?/i;

                if (!job.innerText) return null;
                const details = job.innerText.split('\n');

                const jobObject = {};
                jobObject.post = i + 1
                jobObject.title = details[0]; // also details[1]
                jobObject.company=  details[2];
                jobObject.location = details[3];
                jobObject.potentialSalary = details[4];
                jobObject.link = job.querySelector('a').getAttribute('href');

                const salary = jobObject.potentialSalary.match(salaryRegex) 
                    ? jobObject.potentialSalary.match(salaryRegex)[0] 
                    : jobObject.title.match(salaryRegex) 
                        ? jobObject.title.match(salaryRegex)[0]
                        : '';

                jobObject.salary = salary
                    .replace(/GBP/i, '£')
                    .replace(/K/i, ',000')
                    .replace(', ', ',');
                
                const numericSalaries = salary
                    .split(/(-|to)/)
                    .map(s => s
                        .replace(/K/i, '000')
                        .match(/\d+/g))
                    .reverse();
                                    
                jobObject.upperSalary = numericSalaries[0] ? +numericSalaries[0].join('') : null;
                jobObject.lowerSalary = numericSalaries[2] ? +numericSalaries[2].join('') : jobObject.upperSalary;

                return jobObject;
            });

        return totalPosts;
    })

    const jobfilters = [
        job => job.salary && ((job.lowerSalary + job.upperSalary) / 2 >= 65000),

        job => isIncluded(job.title, ['mid']) 
            || !isIncluded(job.title, ['senior', 'lead', 'manager', 'principal', 'graduate', 'junior', 'test']),
        
        job => isIncluded(job.title, ['c#', '.net'])
            || !isIncluded(job.title, ('clojure scala mobile android golang 365 solidity devops node azure react ' + 
                    'integration power crm dynamics application').split(' '))
    ]

    const filteredPosts = jobs
        .filter(job => jobfilters.every(jobFilter => jobFilter(job)))
        .sort((a, b) => (b.upperSalary - a.upperSalary) || (b.lowerSalary - a.lowerSalary))
        .map((job, i) => [
                `No. ${i + 1} (${job.post})`, 
                job.salary, 
                job.title,
                job.company,
                job.link
            ].join('\n'));

    const filteredPostsDisplay = filteredPosts.join('\n\n');
    
    console.log(filteredPostsDisplay);
    console.log(`\nFiltered ${filteredPosts.length} out of a total of ${jobs.length}`);

    await browser.close();
})();