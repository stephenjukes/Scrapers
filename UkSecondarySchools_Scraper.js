const { equal } = require('assert');
const { table } = require('console');
const { getegid } = require('process');
const puppeteer = require('puppeteer');

const getSchoolDataOutput = school => [
  // basic
  school.name,
  ifExists(school.mainPageData, 'Type of school'),
  ifExists(school.data, 'Address', 'value'),
  ifExists(school.data, 'Headteacher', 'value'),
  ifExists(school.data, 'School type', 'value'),
  ifExists(school.data, 'Religious character', 'value'),
  ifExists(school.data, 'Age range', 'value'),
  ifExists(school.data, 'Gender of entry', 'value'),
  ifExists(school.data, 'Ofsted rating', 'value').split(' | ')[0],
  ifExists(school.data, 'Admissions policy', 'value'),

  // rating related
  ifExists(school.mainPageData, 'Number of pupils at end of key stage 4'),
  ifExists(school.mainPageData, 'Number of pupils included in this measure'),
  ifExists(school.mainPageData, 'Score & description'),
  ifExists(school.mainPageData, 'Entering EBacc'),
  ifExists(school.mainPageData, 'Staying in education or entering employment (2017 leavers)'),
  ifExists(school.mainPageData, 'Attainment 8 score'),
  ifExists(school.mainPageData, 'EBacc average point score'),

  // contact & more information
  ifExists(school.data, 'Website', 'link'),
  school.emailAddresses.join(';')

].join(';');

// TODO: Make into recursive function later - use funcs to be more generic
const ifExists = (jsonPath, key, extra = 'nonExistent') => {
  const primaryValue = jsonPath.hasOwnProperty(key) ? jsonPath[key] : '-';
  return primaryValue.hasOwnProperty(extra) ? primaryValue[extra] : primaryValue;
}

const getEmails = async (page) => {
  return await page.evaluate(() => {
    const emails = [...document.getElementsByTagName('body')[0].innerHTML.matchAll(/(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-zA-Z0-9-]*[a-zA-Z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/g)]
      .map(match => match[0])
      .filter(email => !/[?/]/.test(email));

    return [...new Set(emails)];
  });
}

(async() => {
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = (await browser.pages())[0];
  const baseUrl = 'https://www.compare-school-performance.service.gov.uk';
  const main = '/schools-by-type?step=default&table=schools&region=all-england&for=secondary';

  const totalPages = 1; // 131;
  let allSchools = [];

  // Get school data from main government page
  for(i = 1; i <= totalPages; i++) {
    await page.goto(baseUrl + main + '&page=' + i);

    const schools = await page.evaluate(() => {
      return [ ...document.querySelectorAll('tr[data-row-id="SchoolsResultsRow"]') ]
        .map(tr => {
          const th = tr.getElementsByClassName('result-school-link')[0];
          const name = th.innerText;
          const partitionLink = th.getAttribute('href')

          const mainPageData = [...tr.querySelectorAll('td[data-title]')]
            .reduce((dataObject, td) => {
              const dataKey = td.dataset.title;
              const dataValue = td.querySelectorAll('.value, .progress-value')[0].innerText.split('\n')[0];
              dataObject[dataKey] = dataValue;  // merge properly with spread operator if time

              return dataObject;
            }, {})

          return {
            name: name,
            partitionLink: partitionLink,
            mainPageData: mainPageData,
            data: {},
            emailAddresses: []
          }
        })
    });

    allSchools = allSchools.concat(schools);
  }

  // Get data from school scoped government page 
  let entry = 0;
  for(const school of allSchools) {
    try {
      entry++;

      await page.goto(baseUrl + school.partitionLink);

      dataValues = await page.evaluate(() => {
        const dts = [...document.getElementsByTagName('dt')];
        const dds = [...document.getElementsByTagName('dd')];

        let data = {};
        for(let i = 0; i < dts.length; i++) {
          const heading = dts[i].innerText.split('\n')[0].trim().replace(':', '');
          const dd = dds[i];

          data[heading] = {
            value: dd.innerText.split('\n')[0].trim(),
            link: dd.firstElementChild && dd.firstElementChild.hasAttribute('href') 
            ? dd.firstElementChild.getAttribute('href') 
            : null
          };
        }

        return data;
      })
      school.data = dataValues;

      // Visit school website and extract emails
      const schoolHomepage = school.data.Website.link;
      await page.goto(schoolHomepage);

      school.emailAddresses = await getEmails(page);

      if (school.emailAddresses.length == 0) {
        const contactPages = await page.evaluate(() => {
          const contacts = [...document.querySelectorAll('a[href*=contact], a[href*=Contact]')]
            .map(contact => contact.getAttribute('href'));

          return [...new Set(contacts)];
        });

        for(let contactPage of contactPages) {
          try {
            await page.goto(schoolHomepage + contactPage);
            const emails = await getEmails(page);
            school.emailAddresses = school.emailAddresses.concat(emails);
          }
          catch(ex) {
            continue;
          }
        }
      }

      console.log();
      console.log([entry, school.name]);
      console.log(`;;${entry};${getSchoolDataOutput(school)}`);
    }
    catch(ex) {
      console.log(`Error;${ex.message.split('\n')[0]};${entry};${getSchoolDataOutput(school)}`);
      continue;
    }
  }

  await browser.close();
})();