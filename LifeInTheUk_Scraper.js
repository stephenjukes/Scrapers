const { equal } = require('assert');
const puppeteer = require('puppeteer');


(async() => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://lifeintheuktestweb.co.uk/british-citizenship-test-1/');

    
    const tests = await page.evaluate(() =>
      [...document.querySelectorAll('[rel="dofollow"]')].map(e => e.getAttribute('href'))
    );

    let exerciseCount = 0;
    for(var test of tests) {
      await page.goto(test);
      let title = await page.evaluate(() => document.querySelector('h1').innerHTML);  
      console.log('----------------------------------------------------------------');    
      console.log(title);
      console.log('----------------------------------------------------------------');  

      // await page.click('[name="check"]');
      // await page.waitForSelector('.wpProQuiz_answerCorrect');

      let exercises = await page.evaluate(() => {
        const includeAnswers = true;
        const includeDuplicates = false;
        const includeUndefined = false;

        return [...document.querySelectorAll('.wpProQuiz_listItem')]
          .map(e => e.innerHTML)
          .map(e => {
            let questionNumber = e.match(/Question\s*?<span>(\d+)<\/span>/)[1].trim();
            let [question, answer] = [...e.matchAll(/<(b|strong)>(.*?)<\/(b|strong)>/g)].map(m => m[2].trim());
            let options = [...e.matchAll(/<label>(.|\n)*?<input(.|\n)*?>(.*?)<\/label>/g)].map(m => m[3].trim());
            //let solution = e.match(/wpProQuiz_incorrect(.|\n)*?<p>((.|\n)*?)<\/p>/)[2].replace(/<.+?>/g, '');

            return {
              questionNumber: questionNumber,
              question: question,
              options: options,
              answer: answer,
              answerToDisplay: includeAnswers ? answer : '-'
            }
          })
          .reduce((selected, exercise) => {
            return  (includeDuplicates || !selected.map(e => e.answer).includes(exercise.answer)) &&
                    (includeUndefined || typeof exercise.answer != 'undefined')
                      ? selected.concat(exercise)
                      : selected
          }, [])
      })

      for(e of exercises) {
        console.log(`${e.questionNumber}.\n${e.question} (${e.answerToDisplay})\n${e.options.map(o => '\t-' + o).join('\n')}`);
        console.log();
      }

      console.log(exercises.length);
      exerciseCount += (exercises.length);
    }

    console.log(exerciseCount);

    //texts.forEach(t => console.log(t));

    await browser.close();
})();
