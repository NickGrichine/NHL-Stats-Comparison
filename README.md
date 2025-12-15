# Top 100 NHL Players Comparison 🏒

[View the live site here](https://nickgrichine.github.io/NHL-Players-Comparison/)

## 📖 Description
Compare NHL skaters using an interactive radar chart and a side-by-side stats table. Select up to four players and see how they stack up across key metrics like Points, Goals, Assists, Plus/Minus, and more.

## 🚀 Features
 - **Interactive radar chart (Chart.js)**
  - **Hover** over chart axes to see the full stat name (e.g., P → Points) after a brief delay
  - **Dataset tooltips** show actual stat values for the hovered player
- **Player stats table**
  - **Native hover tooltips** reveal full names for abbreviated stats
  - **Team tooltip**: e.g., EDM → Edmonton Oilers (supports multi-team entries like "COL, CAR, DAL")
  - **Position tooltip**: e.g., C → Center, C/R → Center, Right Wing
- **Player selection**
  - Autocomplete/dropdown for the **Top 100** NHL players (from the CSV)
  - Compare Player 1 and Player 2 by default; optionally add up to two more players (3 and 4)
- **Clean, responsive UI** with keyboard-friendly inputs

## 🛠️ Technologies Used
- HTML5  
- CSS3  
- JavaScript  
- Chart.js
- Papa Parse

## ⚙️ Usage
1. Pick two players using the inputs at the top (type to filter or click the ▼ arrow).
2. Optionally, click the + button to add up to two additional players (3 and 4).
3. Review the radar chart and the table:
   - Hover a radar axis to see the full stat name after a short delay.
   - Hover stat names, the team cell, or the position cell in the table to see the full name after a short delay (native browser tooltip).
  
## 📊 Data

- Source file: `regular-season-skaters.csv`
- Expected columns (subset used by this app):
  - `Player`, `Team`, `Pos`, `GP`, `P`, `G`, `A`, `+/-`, `P/GP`, `EVP`, `PPP`, `PIM`
- The app reads the first **100** rows to populate the dropdown lists.
- Tooltip mappings:
  - **Teams**: standard NHL abbreviations → full names (e.g., `EDM` → `Edmonton Oilers`). Multiple teams supported (e.g., `COL, CAR, DAL`).
  - **Positions**: common abbreviations → full names (e.g., `C` → `Center`, `L`/`LW` → `Left Wing`, `R`/`RW` → `Right Wing`, `D` → `Defenseman`). Combined positions are supported (e.g., `C/R`).

## 🔗 Deployment
This project is deployed via **GitHub Pages**.  
You can view it here:  
👉 **https://nickgrichine.github.io/NHL-Players-Comparison/**

## 📌 Next Steps / Future Features
- Implement usage of an API to allow real-time stats updates
- Add a feature to be able to switch to comparing teams instead of individual players
- Expand styling for more polish and add more interactive features
