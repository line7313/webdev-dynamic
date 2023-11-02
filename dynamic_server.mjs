import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { default as express } from "express";
import { default as sqlite3 } from "sqlite3";

const port = 8080;
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, "public");
const templatePath = path.join(__dirname, "templates");
let renderedTemplate = "";
let titleAbbr = "";
let errorMessage = "";
let historyArray = [];
let currentIndex = 0;
let buttons = "";
let urlStack = [];




let app = express();
app.use(express.static(root));

let title = "";
const db = new sqlite3.Database(
  path.join(__dirname, "nhl_data.sqlite3"),
  sqlite3.OPEN_READONLY,
  (err) => {
    if (err) {
      console.log("Error connecting to database");
    } else {
      console.log("Successfully connected to database");
    }
  }
);

let template = new Promise((resolve, reject) => {
  fs.readFile(path.join(templatePath, "temp.html"), "utf-8", (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
});

let homeTemplate = new Promise((resolve, reject) => {
  fs.readFile(path.join(templatePath, "home.html"), "utf-8", (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
});

function queryDatabase(column, modifier, queryOverride = false) {
  return new Promise((resolve, reject) => {
    let query;
    let selectionModifier =
      "season, date, home_team, away_team, home_team_abbr, away_team_abbr, home_team_score, away_team_score, game_quality_rating, game_importance_rating FROM nhl_data WHERE ";
    if (queryOverride) {
      query = `SELECT ${selectionModifier} ${column} ${modifier} ORDER BY ${column} + 1 DESC;` // need to cast number so that 8 will not come before 79
    } else {
      query = `SELECT ${selectionModifier} home_team_abbr = '${column}' OR away_team_abbr = '${column}'ORDER BY date DESC;`;
    }

    db.all(query, (err, rows) => {
      if (err || rows.length == 0) {
        reject();
      } else {
        resolve(rows);
      }
    });
  });
}

function abbreviationMapper(abbr, column) {
  let queryModifier;

  switch (abbr) {
    case "verylow":
      queryModifier = "< 20";
      titleAbbr = "Very Low";
      break;

    case "low":
      queryModifier = `>= 20 AND ${column} < 40`;
      titleAbbr = "Low";
      break;

    case "medium":
      queryModifier = `>= 40 AND ${column} < 60`;
      titleAbbr = "Medium";
      break;

    case "high":
      queryModifier = `>= 60 AND ${column} < 80`;
      titleAbbr = "High";
      break;
    case "veryhigh":
      queryModifier = ">= 80";
      titleAbbr = "Very High";
      break;

      case "all":
      queryModifier = ">=0";
      titleAbbr = "All";
      break;

    default:
      queryModifier = null; //return all
  }

  return queryModifier;
}

function createTableRow(entrys) {
  let tableEntrys = "<tr>";

  entrys.forEach((entry) => {
    tableEntrys += "<td>" + entry + "</td>";
  });

  return tableEntrys + "</tr>";
}

function createTableHead(columns) {
  let tableHead = "<thead> <tr>";

  columns.forEach((column) => {
    tableHead += "<th>" + column + "</th>";
  });

  return tableHead + "</tr> </thead> <tbody>";
}

function renderTemplate(route, data, userInput) {
  return new Promise((resolve, reject) => {
    let imageSource = "";
    let imageAlt = "";
    template.then((template) => {
      if (route == "team") {
        //This is the route we specify when calling the renderTemplate function
        let teamName = mapName(userInput, data);
        title = `Game Data for ${teamName}`; //The title above the data
        let table = ""; //Table structure is as follows, HEAD, ROW, ROW, ROW, etc
        table += createTableHead([
          "Date",
          "Home Team",
          "Away Team",
          "Home Team Score",
          "Away Team Score",
        ]); // Create the labels for the columns we want for this route (will change depending on route)
        table += "<tbody>"; // NEED TO PUT EACH ROW WITHIN THE BODY
        data.forEach((game) => {
          table += createTableRow([
            game.date,
            game.home_team,
            game.away_team,
            game.home_team_score,
            game.away_team_score,
          ]); // Populate a row for every game
        });
        table += "</tbody>";
        renderedTemplate = template.replace("##TITLE##", title); // title replacement
        renderedTemplate = renderedTemplate.replace("##TABLE_DATA##", table); // table replacement
        imageSource =
          "https://cdn1.sportngin.com/attachments/photo/2721/4644/Mpls_Arena_large.jpg";
        imageAlt = "A picture of a vintage hockey arena";
        renderedTemplate = renderedTemplate.replace(
          "##IMAGE_SRC##",
          imageSource
        );
        renderedTemplate = renderedTemplate.replace("##IMAGE_ALT##", imageAlt);
        renderedTemplate = renderedTemplate.replace("##PREV##", urlStack[currentIndex+1]);
        renderedTemplate = renderedTemplate.replace("##NEXT##", urlStack[currentIndex-1]);

        //constructNextPrevious();
        //renderedTemplate = renderedTemplate.replace("##NEXT_PREVIOUS##", buttons);

        const dynamicTitle = `<div class="row">
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/"><h4 class="text-center">Home</h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/team/min"><h4 class="text-center"><b>Teams</b></h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/quality/all"><h4 class="text-center">Quality</h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/importance/all"><h4 class="text-center">Importance</h4></a>
        </div>
    </div>`;
    renderedTemplate = renderedTemplate.replace('##BUTTON##', dynamicTitle);

        resolve(renderedTemplate);
      } else if (route == "quality") {
        let gameQuality = titleAbbr;
        title = `Showing Data For ${gameQuality} Quality Games `;
        let table = "";
        table += createTableHead([
          "Date",
          "Home Team",
          "Away Team",
          "Game Quality Rating",
        ]);

        table += "<tbody>";
        data.forEach((game) => {
          table += createTableRow([
            game.date,
            game.home_team,
            game.away_team,
            game.game_quality_rating,
          ]);
        });
        table += "</tbody>";
        renderedTemplate = template.replace("##TITLE##", title);
        imageSource =
          "https://stevethedoc.files.wordpress.com/2020/02/1942483.jpg";
        imageAlt = "A picture of a quality stamp";
        renderedTemplate = renderedTemplate.replace(
          "##IMAGE_SRC##",
          imageSource
        );
        renderedTemplate = renderedTemplate.replace("##TABLE_DATA##", table); // table replacement
        renderedTemplate = renderedTemplate.replace("##IMAGE_ALT##", imageAlt);
        renderedTemplate = renderedTemplate.replace("##PREV##", urlStack[currentIndex+1]);
        renderedTemplate = renderedTemplate.replace("##NEXT##", urlStack[currentIndex-1]);

        //constructNextPrevious();
        //renderedTemplate = renderedTemplate.replace("##NEXT_PREVIOUS##", buttons);
        const dynamicTitle = `<div class="row">
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/"><h4 class="text-center">Home</h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/team/min"><h4 class="text-center">Teams</h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/quality/all"><h4 class="text-center"><b>Quality</b></h4></a>
        </div>
        <div class="col-12 col-md-3" style="color: white;">
            <a href="/importance/all"><h4 class="text-center">Importance</h4></a>
        </div>
    </div>`;
    renderedTemplate = renderedTemplate.replace('##BUTTON##', dynamicTitle);

        resolve(renderedTemplate);
      } else if (route == "importance") {
        let teamName = titleAbbr;
        title = `Showing Data For ${teamName} Importance Games `;
        let table = ""; //Table structure is as follows, HEAD, ROW, ROW, ROW, etc
        table += createTableHead([
          "Date",
          "Home Team",
          "Away Team",
          "Importance",
        ]); // Create the labels for the columns we want for this route (will change depending on route)

        table += "<tbody>"; // NEED TO PUT EACH ROW WITHIN THE BODY
        data.forEach((game) => {
          table += createTableRow([
            game.date,
            game.home_team,
            game.away_team,
            game.game_importance_rating,
          ]); // Populate a row for every game
        });

        table += "</tbody>";
        imageSource =
          "https://www.picserver.org/assets/library/2020-10-13/originals/importance.jpg";
        imageAlt = "A picture of a sign that says importance";
        renderedTemplate = template.replace("##TITLE##", title); // title replacement
        renderedTemplate = renderedTemplate.replace("##TABLE_DATA##", table); // table replacement
        renderedTemplate = renderedTemplate.replace(
          "##IMAGE_SRC##",
          imageSource
        );
        renderedTemplate = renderedTemplate.replace("##IMAGE_ALT##", imageAlt);
        renderedTemplate = renderedTemplate.replace("##PREV##", urlStack[currentIndex+1]);
        renderedTemplate = renderedTemplate.replace("##NEXT##", urlStack[currentIndex-1]);


        //constructNextPrevious();
        //renderedTemplate = renderedTemplate.replace("##NEXT_PREVIOUS##", buttons);
        const dynamicTitle = `<div class="row">
                    <div class="col-12 col-md-3" style="color: white;">
                        <a href="/"><h4 class="text-center">Home</h4></a>
                    </div>
                    <div class="col-12 col-md-3" style="color: white;">
                        <a href="/team/min"><h4 class="text-center">Teams</h4></a>
                    </div>
                    <div class="col-12 col-md-3" style="color: white;">
                        <a href="/quality/min"><h4 class="text-center">Quality</h4></a>
                    </div>
                    <div class="col-12 col-md-3" style="color: white;">
                        <a href="/importance/min"><h4 class="text-center"><b>Importance</b></h4></a>
                    </div>
                </div>`;
                renderedTemplate = renderedTemplate.replace('##BUTTON##', dynamicTitle);

        resolve(renderedTemplate);
      }

      reject();
    });
  });
}

function mapName(inputAbbr, data) {
  if (inputAbbr == data[0].home_team_abbr) {
    return data[0].home_team;
  } else {
    return data[0].away_team;
  }
}

app.get('/previous', (req, res) => {
  if (currentIndex > 0) {
    currentIndex--;
    res.redirect(urlStack[currentIndex]);
  } else {
    res.status(404).send("No previous page available.");
  }
});

app.get('/next', (req, res) => {
  if (currentIndex < urlStack.length - 1) {
    currentIndex++;
    res.redirect(urlStack[currentIndex]);
  } else {
    res.status(404).send("No next page available.");
  }
});




app.get("/", async (req, res) => {
  historyArray.push('/');
  currentIndex = -1;
  homeTemplate.then((homeTemplate) => {
    res.status(200).type("html").send(homeTemplate);
  });
});

app.get("/redirect", async (req, res) => {
  let team = req.query.redirectTeam;
  let quality = req.query.redirectQuality;
  let importance = req.query.redirectImportance;

  if (team) {
    res.redirect(`/team/${team}`);
  } else if (quality) {
    res.redirect(`/quality/${quality}`);
  } else {
    res.redirect(`/importance/${importance}`);
  }
});

app.get("/team/:team", (req, res) => {
  let teamAbbr = req.params.team.toUpperCase();
  urlStack.push('/team/' + teamAbbr);
  console.log(urlStack);
  currentIndex = urlStack.length - 1;
  currentIndex++;
  errorMessage =
    "ERROR 404 NOT FOUND: Can not find game data for requested team abbreviation " +
    teamAbbr;
 queryDatabase(teamAbbr)
    .then((data) => {
      renderTemplate("team", data, teamAbbr).then(() => {
        res.status(200).type("html").send(renderedTemplate);
      });
    })
    .catch(() => {
      res.status(404).send(errorMessage);
    });
});

app.get("/quality/:quality", async (req, res) => {
  let column = "game_quality_rating";
  let quality = req.params.quality.toLowerCase();
  urlStack.push('/quality/' + quality); 
  currentIndex = urlStack.length - 1;
  errorMessage ="ERROR 404 NOT FOUND: Can not find game data for " + quality + " quality";
  currentIndex++;
  let queryModifier = abbreviationMapper(quality, column);
  queryDatabase(column, queryModifier, true).then((rows) => {
    renderTemplate("quality", rows, quality).then(() => {
      res.status(200).type("html").send(renderedTemplate);
    });
  }).catch(() => {
    res.status(404).send(errorMessage);
  });
});

app.get("/importance/:importance", async (req, res) => {
  let column = "game_importance_rating";
  let importance = req.params.importance.toLowerCase();
  urlStack.push('/importance/' + importance);
  currentIndex = urlStack.length - 1;
  currentIndex++;
  errorMessage =
    "ERROR 404 NOT FOUND: Can not find game data for " +
    importance +
    " importance";
  let queryModifier = abbreviationMapper(importance, column);
  let rows = queryDatabase(column, queryModifier, true).then((rows) => {
    renderTemplate("importance", rows, importance).then(() => {
      res.status(200).type("html").send(renderedTemplate);
    });
  }).catch(() => {
    res.status(404).send(errorMessage);
  });
});

app.listen(port, () => {
  console.log("http://localhost:8080");
});

//test
