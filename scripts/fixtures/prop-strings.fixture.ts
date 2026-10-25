/**
 * Real prop stat names as books print them (DraftKings, DK Pick6, PrizePicks, Underdog, Sleeper, Betr, ParlayPlay,
 * Dabble, Power Play-style books), by league. Each must map to a stat we follow live, or be on NOT_TRACKABLE.
 */
const NBA = [
  // PrizePicks
  "Points", "Rebounds", "Assists", "Pts+Rebs+Asts", "Pts+Rebs", "Pts+Asts", "Rebs+Asts", "3-PT Made", "3-PT Attempted", "FG Made", "FG Attempted",
  "Two Pointers Made", "Two Pointers Attempted", "Free Throws Made", "Free Throws Attempted", "Offensive Rebounds", "Defensive Rebounds", "Blocked Shots",
  "Steals", "Blks+Stls", "Turnovers", "Personal Fouls", "Fantasy Score", "Dunks",
  // Underdog
  "Pts + Rebs + Asts", "Rebounds + Assists", "Points + Rebounds", "Points + Assists", "Blocks + Steals", "3-Pointers Made", "Double Doubles", "Triple Doubles",
  "Fantasy Points", "FG Attempted", "Free Throws Attempted", "Field Goals Made",
  // Sleeper / Betr / ParlayPlay / Dabble
  "PRA", "PR", "PA", "RA", "3PM", "3PA", "Stocks", "Player Points", "Player Rebounds", "Player Assists", "Player Threes", "Player Three Pointers Made",
  "Pts + Reb", "Pts + Ast", "Reb + Ast", "Stl + Blk", "TOV", "Threes", "Three Pointers Made", "3 Pointers Made", "3pt Made", "3-pt", "Minutes",
  // Power Play-style and screenshots
  "2-pt att", "2-PT ATT", "2PA", "2PT attempted", "two pointers attempted", "2-pt made", "2PM", "Att 2-pt", "Made 2-pt", "3pta", "3-pt att", "Att 3-pt",
  "Pts + Rebs + Asts", "Reb+Ast", "Ast+Reb", "Rebs+Pts", "P+R+A", "P+R", "P+A", "R+A", "S+B", "B+S", "FGA", "FGM", "FTA", "FTM", "OREB", "DREB", "PF",
  "TO", "Double-Double", "Triple-Double", "Points + Rebounds + Assists", "Pts+Reb+Ast+Stl", "Pts+Rebs+Asts+Stls+Blks", "points (combo)", "PTS", "REB", "AST",
  "STL", "BLK", "Fantasy", "First Basket", "Points 1Q", "1Q Points", "1H Pts+Rebs+Asts", "2nd Quarter Points", "1st Half Rebounds", "Q3 Assists",
  "Steals + Blocks", "Off Rebounds", "Def Rebounds", "Free Throws", "Field Goals Attempted", "3-Point Field Goals Made", "3 Point FG Attempted",
];
const WNBA = ["Points", "Rebounds", "Assists", "Pts+Rebs+Asts", "3-PT Made", "Two Pointers Attempted", "FG Attempted", "Blks+Stls", "Fantasy Score", "Turnovers", "Double Doubles", "PRA", "2-pt att", "Free Throws Made", "Pts + Rebs"];
const NCAAB = ["Points", "Rebounds", "Assists", "Pts+Rebs+Asts", "3-PT Made", "Pts+Rebs", "FG Made", "Two Pointers Made", "Free Throws Attempted", "Offensive Rebounds", "Steals", "Blocked Shots", "Fantasy Score", "PRA", "Reb+Ast"];
const NFL = [
  // PrizePicks / Underdog / Pick6
  "Pass Yards", "Passing Yards", "Rush Yards", "Rushing Yards", "Receiving Yards", "Rec Yards", "Receptions", "Rush+Rec Yds", "Rush + Rec Yards", "Pass+Rush Yds",
  "Passing + Rushing Yards", "Pass TDs", "Passing TDs", "Pass Attempts", "Passing Attempts", "Pass Completions", "Completions", "INT", "Interceptions Thrown",
  "Rush Attempts", "Carries", "Longest Rush", "Longest Reception", "Longest Pass Completion", "Longest Completion", "Targets", "Fantasy Score", "Fantasy Points",
  "Kicking Points", "FG Made", "Field Goals Made", "Tackles+Ast", "Tackles + Assists", "Solo Tackles", "Assisted Tackles", "Sacks", "Rush + Rec TDs",
  "Anytime TD", "Anytime Touchdown Scorer", "First TD Scorer", "Last TD Scorer", "Rec Yds", "Rush Yds", "Pass Yds", "Pass Att", "Rush Att", "Rec",
  "Recs", "Catches", "Comps", "Cmp", "Ints", "Rushing TDs", "Receiving TDs", "Extra Points Made", "XP Made", "PAT Made", "Longest FG", "Fumbles Lost",
  "Tackles for Loss", "Passes Defended", "Total Tackles", "Rush+Rec TDs", "Rec + Rush Yds", "Scrimmage Yards", "Pass + Rush Yds", "Rush & Rec Yds",
  "1Q Pass Yards", "1H Rush Yards", "2nd Quarter Receiving Yards", "4th Quarter Rush Yds", "2H Receptions", "Q1 Rec Yds", "First Downs", "Yds Passing",
  "Player Passing Yards", "Player Receptions", "Pass Comp", "Passing Interceptions", "Long Rush", "Long Reception", "Longest Run", "Kicking Pts",
];
const NCAAF = ["Pass Yards", "Rush Yards", "Receiving Yards", "Receptions", "Rush+Rec Yds", "Pass TDs", "Pass Attempts", "Completions", "Rush Attempts", "Fantasy Score", "Pass+Rush Yds", "Longest Rush", "Kicking Points", "Interceptions", "Sacks"];
const MLB = [
  // PrizePicks / Underdog / Pick6
  "Hits", "Runs", "RBIs", "Hits+Runs+RBIs", "Hits + Runs + RBIs", "Total Bases", "Total Bases (From Hits)", "Singles", "Doubles", "Triples", "Home Runs",
  "Extra Base Hits", "Walks", "Stolen Bases", "Hitter Fantasy Score", "Batter Fantasy Points", "Hitter Strikeouts", "Pitcher Strikeouts", "Strikeouts Thrown",
  "Pitching Outs", "Outs", "Outs Recorded", "Hits Allowed", "Hits Against", "Earned Runs Allowed", "Walks Allowed", "Pitcher Fantasy Score", "Pitches Thrown",
  "Runs Allowed", "H+R+RBI", "HRR", "TB", "Ks", "K", "ER", "BB", "HR", "RBI", "1B", "2B", "Pitch Count", "Batter Walks", "Strikeouts", "Pitcher Ks",
  "Runs Batted In", "Runs Scored", "Batter Hits", "Batter Total Bases", "Pitcher Outs", "Earned Runs", "XBH", "Home Run", "To Hit a Home Run", "Hit By Pitch",
  "Pitcher Walks", "Walks Issued", "Strike Outs", "Batter Singles", "Pitcher Win",
];
const NHL = [
  "Goals", "Assists", "Points", "Shots On Goal", "SOG", "Saves", "Goalie Saves", "Goals Against", "Blocked Shots", "Blocks", "Hits", "Faceoffs Won", "Power Play Points",
  "Goals + Assists", "Time On Ice", "Penalty Minutes", "PIM", "Shots", "Player Shots on Goal", "Anytime Goal Scorer", "Goaltender Saves", "Goals Allowed", "G+A", "First Goal Scorer",
  "Player Points", "Player Assists", "Player Goals", "Shots on Net", "Fantasy Score", "Faceoff Wins",
];

export const PROP_FIXTURES: { text: string; league: string }[] = [
  ...NBA.map((text) => ({ text, league: "nba" })),
  ...WNBA.map((text) => ({ text, league: "wnba" })),
  ...NCAAB.map((text) => ({ text, league: "ncaam" })),
  ...NFL.map((text) => ({ text, league: "nfl" })),
  ...NCAAF.map((text) => ({ text, league: "ncaaf" })),
  ...MLB.map((text) => ({ text, league: "mlb" })),
  ...NHL.map((text) => ({ text, league: "nhl" })),
];
