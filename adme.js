const puppeteer = require('puppeteer');

const categories = {
    animalsAndPets: 'animals_pets',
    eventsAndEntertainment: 'events_entertainment',
    homeAndGarden: 'events_entertainment',
    restaurantsAndBars: 'restaurants_bars',
    beautyAndWellbeing: 'beauty_wellbeing',
    foodBeveragesAndTobacco: 'food_beverages_tobacco',
    homeServices: 'home_services',
    shoppingAndFashion: 'shopping_fashion',
    businessServices: 'business_services',
    healthAndMedical: 'health_medical',
    legalServicesAndGovernment: 'legal_services_government',
    sports: 'sports',
    constructionAndManufacturing: 'construction_manufacturing',
    mediaAndPublishing: 'media_publishing',
    educationAndTraining: 'education_training',
    hobbiesAndCrafts: 'hobbies_crafts',
    moneyAndInsurance: 'money_insurance',
    travelAndVacation: 'tavel_vacation',
    publicAndLocalServices: 'public_local_services',
    utilities: 'utilities',
    electronicsAndTechnology: 'electronics_technology',
    vehiclesAndTransportation: 'vehicles_transportation'
}

const clickIfExists = async (page, selector) => {
    const element = await page.$(selector);
    if (element) await element.evaluate(b => b.click());
};

const scrapeCompanyPage = async page => {
    return page.evaluate(() => {
        const header = document.querySelector('[class^="styles_businessInformation"]');
        const address = document.querySelector('address');

        const postalAddress = address 
            ? [...address.querySelectorAll('ul li ul li')].map(li => li.innerText)
            : null;
        
        const categoryLinks = [...document
            .querySelector('[class*="categoriesList"]')
            .querySelectorAll('a')];

        return {
            title: header?.querySelector('h1 span')?.innerText.trim(),
            logo: header?.querySelector('picture img')?.src,
            website: header?.querySelector('[class*="smartEllipsisContainer"]')?.innerText.replace('\n', ''),
            email: address?.querySelector('a[href^="mailto"]')?.href.replace('mailto:', ''),
            phone: address?.querySelector('a[href^="tel"')?.href.replace('tel:', ''),
            address: {
                firstLines: postalAddress?.slice(0, postalAddress.length -3)?.join(', '),
                postcode: postalAddress?.find(item => /^([A-Za-z]{1,2}[\d]{1,2}[A-Za-z]?)[\s]?([\d][A-Za-z]{2})$/.test(item)),
                city: postalAddress?.[postalAddress.length - 2],
                country: postalAddress?.[postalAddress.length - 1]
            },
            review: {
                rating: Number(header.querySelector('[data-rating-typography]')?.innerText),
                count: Number([...header.querySelectorAll('span')]
                ?.map(s => s.innerText)?.[2]
                ?.match(/^[\d,]+/)?.[0]
                ?.replace(',', ''))
            },            
            categories: [... new Set(categoryLinks
                ?.map(link => link.innerText.match(/\w+/g))
                ?.reduce((acc, group) => acc.concat(group))
                ?.map(tag => tag.toLowerCase()))],
            
            // about: document.querySelector('.customer-generated-content').innerText
        };
    });
}

const convertToCsv = async json => {
    return [
        json.title,
        json.logo,
        json.website,
        json.email,
        json.phone,
        json.address.firstLines,
        json.address.postcode,
        json.address.city,
        json.address.country,
        json.review.rating,
        json.review.count,
        json.categories
    ]
    .map(item => (item || '').toString().replace(/,\s?/g, '|'))
    .join(',');
}
 
const scrapeCompanies = async (page, url) => {
    await page.goto(url);
    
    const businessCardAttribute = '[name="business-unit-card"';
    const businessCards = await page.$$(businessCardAttribute);
    const rejectCookiesButton = 'button#onetrust-reject-all-handler';
    const pageNumber = url.match(/\d+$/)[0];

    for (i = 0; i < businessCards.length; i++) {
        const businessCards1 = await page.$$(businessCardAttribute);
        const businessCard = businessCards1[i];
        // clickIfExists(page, rejectCookiesButton);
        
        await businessCard.evaluate(b => b.click());
        // clickIfExists(page, rejectCookiesButton);
        
        await page.waitForNavigation();
        const position = `${pageNumber.padStart(3, '0')}_${(i + 1).toString().padStart(2, '0')}`;

        try {
            const json = await scrapeCompanyPage(page);
            const csv = await convertToCsv(json);
            console.log(`${position},${csv}`);
        } catch {
            console.log('error');
        }
        
        await page.goBack();        
    }
}

(async() => {
    const browser = await puppeteer.launch({
        headless: true
    });

    const page = (await browser.pages())[0];
    const baseUrl = 'https://uk.trustpilot.com/categories';
    const category = categories.animalsAndPets;
    const firstPage = 37;
    const lastPage = 157;

    for (let i = firstPage; i <= lastPage; i++) {
        const url = `${baseUrl}/${category}?page=${i}`;

        await scrapeCompanies(page, url);
    }

    await browser.close();
})();