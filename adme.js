const puppeteer = require('puppeteer');
// import urlExist from "url-exist"

let errorCount = 0;

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

const scrapeHomePage = async (page) => {
    return await page.evaluate(async () => {
        const checkLink = async url => (await fetch(url)
            .then(response => response.ok)
            .catch(_ => false));

        const imageSelector = ['png', 'jpg', 'jpeg', 'svg']
            .map(f => `img[src*=${f}]`)
            .concat('img:not([src^="data"])')
            .join(', ');

        const imageSources = [...document.querySelectorAll(imageSelector)]
            .map(x => x.src.split('?')[0])
            .filter(x => x && x.length < 200);
            
        let successImages = [];
        let imageCount = 0;
        const maxImageCount = 9;
        for(let i = 0; i < imageSources.length && imageCount < maxImageCount; i++) {
            const src = imageSources[i];
            if (await checkLink(src)) {
                successImages.push(src);

                // char limit of 200? 300?
                // remove query params (ie: after '?')
                // don't include those beginning with 'data'
                imageCount++;
            }
        }

        return [...new Set(successImages)];
    })
};

const scrapeCompanyPage = async (page) => {
    // await?
    return await page.evaluate(async () => {
        const capitalize = text => text
            ?.split(' ')
            .map(word => word[0]?.toUpperCase() + word.slice(1))
            .join(' ');

        const random = (min, max) => 
            Math.floor(Math.random() * (max - min + 1) ) + min;

        const checkLink = async url => (await fetch(url)
            .then(response => response.ok)
            .catch(_ => false));

        const getGeolocation = async postcode => (await fetch('https://api.postcodes.io/postcodes/' + postcode)
            .then(response => response.json())
            .then(data => ({
                longitude: data.result.longitude,
                latitude: data.result.latitude
            }))
            .catch(_ => 'Error getting geolocation'));

        const formatUrl = url => {
            return `https://www.${url.replace(/(https?:\/\/)?(www\.)?/, '')}`
        }

        const header = document.querySelector('[class^="styles_businessInformation"]');
        const logo = header => header?.querySelector('picture img')?.src;
        
        const rawWebsite = header?.querySelector('[class*="smartEllipsisContainer"]')?.innerText.replace('\n', '');
        const formattedWebsite = formatUrl(rawWebsite);
        
        const address = document.querySelector('address');
        const postalAddress = address 
            ? [...address.querySelectorAll('ul li ul li')].map(li => li.innerText)
            : null;
        
        const categoryLinks = [...document
            .querySelector('[class*="categoriesList"]')
            .querySelectorAll('a')];

        const outCode = (postalAddress
            ?.join(' ') 
            ?.match(/[A-Z]{1,2}[0-9][A-Z0-9]?/i) || [''])[0]
            ?.toUpperCase();

        const inCode = (postalAddress
            ?.join(' ')
            ?.match(/[0-9][A-Z]{2}/i) || [''])[0]
            ?.toUpperCase();

        const rating = Number(header.querySelector('[data-rating-typography]')?.innerText) || 0;

        return {
            title: header?.querySelector('h1 span')?.innerText.trim(),
            logo: logo(header), // await checkLink(logo(header)) ? logo(header) : null,
            website: formattedWebsite,
            email: address?.querySelector('a[href^="mailto"]')?.href.replace('mailto:', ''),
            phone: address?.querySelector('a[href^="tel"')?.href.replace('tel:', ''),
            address: {
                firstLines: capitalize(postalAddress?.slice(0, postalAddress.length -3)?.join(', ')) || "",
                postcode: {
                    outCode: outCode,
                    inCode: inCode
                },
                city: capitalize(postalAddress?.[postalAddress.length - 2]),
                country: capitalize(postalAddress?.[postalAddress.length - 1]),
                geoLocation: await getGeolocation(outCode + inCode)
            },
            review: {
                rating: rating,
                count: Number([...header.querySelectorAll('span')]
                    ?.map(s => s.innerText)?.[2]
                    ?.match(/^[\d,]+/)?.[0]
                    ?.replace(',', '') 
                    || rating ? random(10, 1000) : 0)
            },            
            categories: [... new Set(categoryLinks
                ?.map(link => link.innerText.match(/\w+/g))
                ?.reduce((acc, group) => acc.concat(group))
                ?.map(tag => tag.toLowerCase()))],
            description: document.querySelector('.customer-generated-content')?.innerText.replace(/\s+/g, ' '),
            createdBy: "PrepopulatedData",
            createdOn: new Date(random(
                            new Date(2024,1,1).getTime(),
                            new Date(2027,1,1).getTime())).toUTCString()
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
        json.address.postcode.outCode,
        json.address.postcode.inCode,
        json.address.city,
        json.address.country,
        json.address.geoLocation.longitude,
        json.address.geoLocation.latitude,
        json.review.rating,
        json.review.count,
        json.categories,
        json.description,
        json.createdBy,
        json.createdOn,
        json.images
    ]
    .map(item => (item || '').toString().replace(/,\s?/g, '|'))
    .join(',');
}
 
const scrapeCompanies = async (page, url, category) => {
    await page.goto(url);
    
    const businessCardLinks = await page.evaluate(async () => {
        const businessCardAttribute = '[name="business-unit-card"]';
        const businessCards = document.querySelectorAll(businessCardAttribute);
        return [...businessCards].map(c => c.href).filter(c => c);
    })

    const pageNumber = url.match(/\d+$/)[0];

    for (i = 0; i < businessCardLinks.length; i++) {
        // console.log(i + 1);

        try {
            await page.goto(businessCardLinks[i]);
            let json = await scrapeCompanyPage(page);

            // get homepage data
            let images = null;
            if (json.website) {
                try {
                    await page.goto(json.website);
                    images = await scrapeHomePage(page);
                    // json = {...json, images: images};
                }
                catch {
                    // do nothing
                }
                finally {
                    json = {...json, images: images};
                }
            }
            
            const csv = await convertToCsv(json);

            const position = `${category}/${pageNumber.padStart(3, '0')}/${(i + 1).toString().padStart(2, '0')}`;
            console.log(`${position},${csv}`);
        } 
        catch (error) {
           errorCount++;
        }       
    }
}

(async() => {
    const browser = await puppeteer.launch({
        headless: true
    });

    const page = (await browser.pages())[0];
    const baseUrl = 'https://uk.trustpilot.com/categories';
    const category = categories.animalsAndPets;
    const firstPage = 144;
    const lastPage = 145;

    for (let i = firstPage; i <= lastPage; i++) {
        const url = `${baseUrl}/${category}?page=${i}`;

        await scrapeCompanies(page, url, category);
    }

    console.log(`errors: ${errorCount}`);

    await browser.close();
})();