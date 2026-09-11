/**
 * Home arena coordinates for rest/travel alerts (seed once, lookup at runtime).
 * Keys match Odds API / Rundown team names via normalized tokens.
 */
export type UsTzBucket = 'ET' | 'CT' | 'MT' | 'PT'

export type SportsVenueRow = {
  sportIds: number[]
  keys: string[]
  venueName: string
  city: string
  lat: number
  lng: number
  tz: UsTzBucket
  /** Extra Rundown city strings that map to this house (e.g. Los Angeles → Inglewood / SoFi). */
  locationHints?: string[]
}

const TZ_ORDER: Record<UsTzBucket, number> = { ET: 0, CT: 1, MT: 2, PT: 3 }

function norm(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** NBA=4, MLB=3, NFL=2, WNBA=8, NHL=6, NCAAF=1, NCAAB=5 */
export const SPORTS_VENUES: SportsVenueRow[] = [
  // NBA
  { sportIds: [4], keys: ['atlanta hawks', 'hawks'], venueName: 'State Farm Arena', city: 'Atlanta', lat: 33.757, lng: -84.396, tz: 'ET' },
  { sportIds: [4], keys: ['boston celtics', 'celtics'], venueName: 'TD Garden', city: 'Boston', lat: 42.366, lng: -71.062, tz: 'ET' },
  { sportIds: [4], keys: ['brooklyn nets', 'nets'], venueName: 'Barclays Center', city: 'Brooklyn', lat: 40.683, lng: -73.975, tz: 'ET' },
  { sportIds: [4], keys: ['charlotte hornets', 'hornets'], venueName: 'Spectrum Center', city: 'Charlotte', lat: 35.225, lng: -80.839, tz: 'ET' },
  { sportIds: [4], keys: ['chicago bulls', 'bulls'], venueName: 'United Center', city: 'Chicago', lat: 41.881, lng: -87.674, tz: 'CT' },
  { sportIds: [4], keys: ['cleveland cavaliers', 'cavaliers', 'cavs'], venueName: 'Rocket Mortgage FieldHouse', city: 'Cleveland', lat: 41.496, lng: -81.688, tz: 'ET' },
  { sportIds: [4], keys: ['dallas mavericks', 'mavericks', 'mavs'], venueName: 'American Airlines Center', city: 'Dallas', lat: 32.790, lng: -96.810, tz: 'CT' },
  { sportIds: [4], keys: ['denver nuggets', 'nuggets'], venueName: 'Ball Arena', city: 'Denver', lat: 39.748, lng: -105.007, tz: 'MT' },
  { sportIds: [4], keys: ['detroit pistons', 'pistons'], venueName: 'Little Caesars Arena', city: 'Detroit', lat: 42.341, lng: -83.055, tz: 'ET' },
  { sportIds: [4], keys: ['golden state warriors', 'warriors'], venueName: 'Chase Center', city: 'San Francisco', lat: 37.768, lng: -122.387, tz: 'PT' },
  { sportIds: [4], keys: ['houston rockets', 'rockets'], venueName: 'Toyota Center', city: 'Houston', lat: 29.751, lng: -95.362, tz: 'CT' },
  { sportIds: [4], keys: ['indiana pacers', 'pacers'], venueName: 'Gainbridge Fieldhouse', city: 'Indianapolis', lat: 39.764, lng: -86.155, tz: 'ET' },
  { sportIds: [4], keys: ['los angeles clippers', 'clippers'], venueName: 'Intuit Dome', city: 'Inglewood', lat: 33.948, lng: -118.337, tz: 'PT' },
  { sportIds: [4], keys: ['los angeles lakers', 'lakers'], venueName: 'Crypto.com Arena', city: 'Los Angeles', lat: 34.043, lng: -118.267, tz: 'PT' },
  { sportIds: [4], keys: ['memphis grizzlies', 'grizzlies'], venueName: 'FedExForum', city: 'Memphis', lat: 35.138, lng: -90.051, tz: 'CT' },
  { sportIds: [4], keys: ['miami heat', 'heat'], venueName: 'Kaseya Center', city: 'Miami', lat: 25.781, lng: -80.188, tz: 'ET' },
  { sportIds: [4], keys: ['milwaukee bucks', 'bucks'], venueName: 'Fiserv Forum', city: 'Milwaukee', lat: 43.045, lng: -87.917, tz: 'CT' },
  { sportIds: [4], keys: ['minnesota timberwolves', 'timberwolves', 'wolves'], venueName: 'Target Center', city: 'Minneapolis', lat: 44.979, lng: -93.276, tz: 'CT' },
  { sportIds: [4], keys: ['new orleans pelicans', 'pelicans'], venueName: 'Smoothie King Center', city: 'New Orleans', lat: 29.949, lng: -90.082, tz: 'CT' },
  { sportIds: [4], keys: ['new york knicks', 'knicks'], venueName: 'Madison Square Garden', city: 'New York', lat: 40.750, lng: -73.993, tz: 'ET' },
  { sportIds: [4], keys: ['oklahoma city thunder', 'thunder'], venueName: 'Paycom Center', city: 'Oklahoma City', lat: 35.463, lng: -97.515, tz: 'CT' },
  { sportIds: [4], keys: ['orlando magic', 'magic'], venueName: 'Kia Center', city: 'Orlando', lat: 28.539, lng: -81.384, tz: 'ET' },
  { sportIds: [4], keys: ['philadelphia 76ers', '76ers', 'sixers'], venueName: 'Wells Fargo Center', city: 'Philadelphia', lat: 39.901, lng: -75.172, tz: 'ET' },
  { sportIds: [4], keys: ['phoenix suns', 'suns'], venueName: 'Footprint Center', city: 'Phoenix', lat: 33.446, lng: -112.071, tz: 'MT' },
  { sportIds: [4], keys: ['portland trail blazers', 'trail blazers', 'blazers'], venueName: 'Moda Center', city: 'Portland', lat: 45.532, lng: -122.667, tz: 'PT' },
  { sportIds: [4], keys: ['sacramento kings', 'kings'], venueName: 'Golden 1 Center', city: 'Sacramento', lat: 38.580, lng: -121.500, tz: 'PT' },
  { sportIds: [4], keys: ['san antonio spurs', 'spurs'], venueName: 'Frost Bank Center', city: 'San Antonio', lat: 29.427, lng: -98.438, tz: 'CT' },
  { sportIds: [4], keys: ['toronto raptors', 'raptors'], venueName: 'Scotiabank Arena', city: 'Toronto', lat: 43.643, lng: -79.379, tz: 'ET' },
  { sportIds: [4], keys: ['utah jazz', 'jazz'], venueName: 'Delta Center', city: 'Salt Lake City', lat: 40.768, lng: -111.901, tz: 'MT' },
  { sportIds: [4], keys: ['washington wizards', 'wizards'], venueName: 'Capital One Arena', city: 'Washington', lat: 38.898, lng: -77.021, tz: 'ET' },
  // MLB
  { sportIds: [3], keys: ['arizona diamondbacks', 'diamondbacks'], venueName: 'Chase Field', city: 'Phoenix', lat: 33.445, lng: -112.067, tz: 'MT' },
  { sportIds: [3], keys: ['athletics', 'oakland athletics'], venueName: 'Sutter Health Park', city: 'Sacramento', lat: 38.580, lng: -121.500, tz: 'PT' },
  { sportIds: [3], keys: ['atlanta braves', 'braves'], venueName: 'Truist Park', city: 'Atlanta', lat: 33.891, lng: -84.468, tz: 'ET' },
  { sportIds: [3], keys: ['baltimore orioles', 'orioles'], venueName: 'Oriole Park', city: 'Baltimore', lat: 39.284, lng: -76.622, tz: 'ET' },
  { sportIds: [3], keys: ['boston red sox', 'red sox'], venueName: 'Fenway Park', city: 'Boston', lat: 42.346, lng: -71.098, tz: 'ET' },
  { sportIds: [3], keys: ['chicago cubs', 'cubs'], venueName: 'Wrigley Field', city: 'Chicago', lat: 41.948, lng: -87.656, tz: 'CT' },
  { sportIds: [3], keys: ['chicago white sox', 'white sox'], venueName: 'Guaranteed Rate Field', city: 'Chicago', lat: 41.830, lng: -87.634, tz: 'CT' },
  { sportIds: [3], keys: ['cincinnati reds', 'reds'], venueName: 'Great American Ball Park', city: 'Cincinnati', lat: 39.097, lng: -84.507, tz: 'ET' },
  { sportIds: [3], keys: ['cleveland guardians', 'guardians', 'indians'], venueName: 'Progressive Field', city: 'Cleveland', lat: 41.496, lng: -81.685, tz: 'ET' },
  { sportIds: [3], keys: ['colorado rockies', 'rockies'], venueName: 'Coors Field', city: 'Denver', lat: 39.756, lng: -104.994, tz: 'MT' },
  { sportIds: [3], keys: ['detroit tigers', 'tigers'], venueName: 'Comerica Park', city: 'Detroit', lat: 42.339, lng: -83.049, tz: 'ET' },
  { sportIds: [3], keys: ['houston astros', 'astros'], venueName: 'Minute Maid Park', city: 'Houston', lat: 29.757, lng: -95.355, tz: 'CT' },
  { sportIds: [3], keys: ['kansas city royals', 'royals'], venueName: 'Kauffman Stadium', city: 'Kansas City', lat: 39.052, lng: -94.484, tz: 'CT' },
  { sportIds: [3], keys: ['los angeles angels', 'angels'], venueName: 'Angel Stadium', city: 'Anaheim', lat: 33.800, lng: -117.883, tz: 'PT' },
  { sportIds: [3], keys: ['los angeles dodgers', 'dodgers'], venueName: 'Dodger Stadium', city: 'Los Angeles', lat: 34.074, lng: -118.240, tz: 'PT' },
  { sportIds: [3], keys: ['miami marlins', 'marlins'], venueName: 'loanDepot park', city: 'Miami', lat: 25.778, lng: -80.220, tz: 'ET' },
  { sportIds: [3], keys: ['milwaukee brewers', 'brewers'], venueName: 'American Family Field', city: 'Milwaukee', lat: 43.028, lng: -87.971, tz: 'CT' },
  { sportIds: [3], keys: ['minnesota twins', 'twins'], venueName: 'Target Field', city: 'Minneapolis', lat: 44.982, lng: -93.278, tz: 'CT' },
  { sportIds: [3], keys: ['new york mets', 'mets'], venueName: 'Citi Field', city: 'New York', lat: 40.757, lng: -73.846, tz: 'ET' },
  { sportIds: [3], keys: ['new york yankees', 'yankees'], venueName: 'Yankee Stadium', city: 'New York', lat: 40.830, lng: -73.926, tz: 'ET' },
  { sportIds: [3], keys: ['oakland athletics', 'athletics'], venueName: 'Sutter Health Park', city: 'Sacramento', lat: 38.580, lng: -121.500, tz: 'PT' },
  { sportIds: [3], keys: ['philadelphia phillies', 'phillies'], venueName: 'Citizens Bank Park', city: 'Philadelphia', lat: 39.906, lng: -75.167, tz: 'ET' },
  { sportIds: [3], keys: ['pittsburgh pirates', 'pirates'], venueName: 'PNC Park', city: 'Pittsburgh', lat: 40.447, lng: -80.006, tz: 'ET' },
  { sportIds: [3], keys: ['san diego padres', 'padres'], venueName: 'Petco Park', city: 'San Diego', lat: 32.707, lng: -117.157, tz: 'PT' },
  { sportIds: [3], keys: ['san francisco giants', 'giants'], venueName: 'Oracle Park', city: 'San Francisco', lat: 37.779, lng: -122.389, tz: 'PT' },
  { sportIds: [3], keys: ['seattle mariners', 'mariners'], venueName: 'T-Mobile Park', city: 'Seattle', lat: 47.591, lng: -122.333, tz: 'PT' },
  { sportIds: [3], keys: ['st louis cardinals', 'cardinals'], venueName: 'Busch Stadium', city: 'St. Louis', lat: 38.623, lng: -90.193, tz: 'CT' },
  { sportIds: [3], keys: ['tampa bay rays', 'rays'], venueName: 'Tropicana Field', city: 'St. Petersburg', lat: 27.768, lng: -82.653, tz: 'ET' },
  { sportIds: [3], keys: ['texas rangers', 'rangers'], venueName: 'Globe Life Field', city: 'Arlington', lat: 32.747, lng: -97.083, tz: 'CT' },
  { sportIds: [3], keys: ['toronto blue jays', 'blue jays'], venueName: 'Rogers Centre', city: 'Toronto', lat: 43.641, lng: -79.389, tz: 'ET' },
  { sportIds: [3], keys: ['washington nationals', 'nationals'], venueName: 'Nationals Park', city: 'Washington', lat: 38.873, lng: -77.007, tz: 'ET' },
  // NFL
  { sportIds: [2, 25], keys: ['arizona cardinals', 'cardinals nfl'], venueName: 'State Farm Stadium', city: 'Glendale', lat: 33.528, lng: -112.263, tz: 'MT' },
  { sportIds: [2, 25], keys: ['atlanta falcons', 'falcons'], venueName: 'Mercedes-Benz Stadium', city: 'Atlanta', lat: 33.755, lng: -84.401, tz: 'ET' },
  { sportIds: [2, 25], keys: ['baltimore ravens', 'ravens'], venueName: 'M&T Bank Stadium', city: 'Baltimore', lat: 39.278, lng: -76.623, tz: 'ET' },
  { sportIds: [2, 25], keys: ['buffalo bills', 'bills'], venueName: 'Highmark Stadium', city: 'Orchard Park', lat: 42.774, lng: -78.787, tz: 'ET' },
  { sportIds: [2, 25], keys: ['carolina panthers', 'panthers'], venueName: 'Bank of America Stadium', city: 'Charlotte', lat: 35.226, lng: -80.853, tz: 'ET' },
  { sportIds: [2, 25], keys: ['chicago bears', 'bears'], venueName: 'Soldier Field', city: 'Chicago', lat: 41.862, lng: -87.617, tz: 'CT' },
  { sportIds: [2, 25], keys: ['cincinnati bengals', 'bengals'], venueName: 'Paycor Stadium', city: 'Cincinnati', lat: 39.095, lng: -84.516, tz: 'ET' },
  { sportIds: [2, 25], keys: ['cleveland browns', 'browns'], venueName: 'Cleveland Browns Stadium', city: 'Cleveland', lat: 41.506, lng: -81.700, tz: 'ET' },
  { sportIds: [2, 25], keys: ['dallas cowboys', 'cowboys'], venueName: 'AT&T Stadium', city: 'Arlington', lat: 32.748, lng: -97.093, tz: 'CT' },
  { sportIds: [2, 25], keys: ['denver broncos', 'broncos'], venueName: 'Empower Field', city: 'Denver', lat: 39.744, lng: -105.020, tz: 'MT' },
  { sportIds: [2, 25], keys: ['detroit lions', 'lions'], venueName: 'Ford Field', city: 'Detroit', lat: 42.340, lng: -83.046, tz: 'ET' },
  { sportIds: [2, 25], keys: ['green bay packers', 'packers'], venueName: 'Lambeau Field', city: 'Green Bay', lat: 44.501, lng: -88.062, tz: 'CT' },
  { sportIds: [2, 25], keys: ['houston texans', 'texans'], venueName: 'NRG Stadium', city: 'Houston', lat: 29.685, lng: -95.411, tz: 'CT' },
  { sportIds: [2, 25], keys: ['indianapolis colts', 'colts'], venueName: 'Lucas Oil Stadium', city: 'Indianapolis', lat: 39.760, lng: -86.164, tz: 'ET' },
  { sportIds: [2, 25], keys: ['jacksonville jaguars', 'jaguars'], venueName: 'EverBank Stadium', city: 'Jacksonville', lat: 30.324, lng: -81.637, tz: 'ET' },
  { sportIds: [2, 25], keys: ['kansas city chiefs', 'chiefs'], venueName: 'Arrowhead Stadium', city: 'Kansas City', lat: 39.049, lng: -94.484, tz: 'CT' },
  { sportIds: [2, 25], keys: ['las vegas raiders', 'raiders'], venueName: 'Allegiant Stadium', city: 'Las Vegas', lat: 36.091, lng: -115.184, tz: 'PT' },
  { sportIds: [2, 25], keys: ['los angeles chargers', 'chargers'], venueName: 'SoFi Stadium', city: 'Inglewood', lat: 33.954, lng: -118.339, tz: 'PT', locationHints: ['los angeles'] },
  { sportIds: [2, 25], keys: ['los angeles rams', 'rams'], venueName: 'SoFi Stadium', city: 'Inglewood', lat: 33.954, lng: -118.339, tz: 'PT', locationHints: ['los angeles'] },
  { sportIds: [2, 25], keys: ['miami dolphins', 'dolphins'], venueName: 'Hard Rock Stadium', city: 'Miami Gardens', lat: 25.958, lng: -80.239, tz: 'ET' },
  { sportIds: [2, 25], keys: ['minnesota vikings', 'vikings'], venueName: 'U.S. Bank Stadium', city: 'Minneapolis', lat: 44.974, lng: -93.258, tz: 'CT' },
  { sportIds: [2, 25], keys: ['new england patriots', 'patriots'], venueName: 'Gillette Stadium', city: 'Foxborough', lat: 42.091, lng: -71.264, tz: 'ET' },
  { sportIds: [2, 25], keys: ['new orleans saints', 'saints'], venueName: 'Caesars Superdome', city: 'New Orleans', lat: 29.951, lng: -90.081, tz: 'CT' },
  { sportIds: [2, 25], keys: ['new york giants', 'giants nfl'], venueName: 'MetLife Stadium', city: 'East Rutherford', lat: 40.814, lng: -74.074, tz: 'ET' },
  { sportIds: [2, 25], keys: ['new york jets', 'jets'], venueName: 'MetLife Stadium', city: 'East Rutherford', lat: 40.814, lng: -74.074, tz: 'ET' },
  { sportIds: [2, 25], keys: ['philadelphia eagles', 'eagles'], venueName: 'Lincoln Financial Field', city: 'Philadelphia', lat: 39.901, lng: -75.168, tz: 'ET' },
  { sportIds: [2, 25], keys: ['pittsburgh steelers', 'steelers'], venueName: 'Acrisure Stadium', city: 'Pittsburgh', lat: 40.447, lng: -80.016, tz: 'ET' },
  { sportIds: [2, 25], keys: ['san francisco 49ers', '49ers'], venueName: "Levi's Stadium", city: 'Santa Clara', lat: 37.403, lng: -121.970, tz: 'PT' },
  { sportIds: [2, 25], keys: ['seattle seahawks', 'seahawks'], venueName: 'Lumen Field', city: 'Seattle', lat: 47.595, lng: -122.332, tz: 'PT' },
  { sportIds: [2, 25], keys: ['tampa bay buccaneers', 'buccaneers'], venueName: 'Raymond James Stadium', city: 'Tampa', lat: 27.976, lng: -82.503, tz: 'ET' },
  { sportIds: [2, 25], keys: ['tennessee titans', 'titans'], venueName: 'Nissan Stadium', city: 'Nashville', lat: 36.166, lng: -86.771, tz: 'CT' },
  { sportIds: [2, 25], keys: ['washington commanders', 'commanders'], venueName: 'Northwest Stadium', city: 'Landover', lat: 38.908, lng: -76.864, tz: 'ET' },
  { sportIds: [2, 25], keys: ['melbourne', 'marvel stadium'], venueName: 'Marvel Stadium', city: 'Melbourne', lat: -37.8165, lng: 144.9475, tz: 'PT' },
  { sportIds: [2, 25], keys: ['london', 'tottenham', 'tottenham hotspur stadium'], venueName: 'Tottenham Hotspur Stadium', city: 'London', lat: 51.6043, lng: -0.0664, tz: 'ET' },
  { sportIds: [2, 25], keys: ['wembley', 'wembley stadium'], venueName: 'Wembley Stadium', city: 'London', lat: 51.556, lng: -0.2796, tz: 'ET' },
  { sportIds: [2, 25], keys: ['mexico city', 'estadio azteca', 'azteca'], venueName: 'Estadio Azteca', city: 'Mexico City', lat: 19.303, lng: -99.1505, tz: 'CT' },
  { sportIds: [2, 25], keys: ['munich', 'allianz arena'], venueName: 'Allianz Arena', city: 'Munich', lat: 48.2188, lng: 11.6247, tz: 'ET' },
  { sportIds: [2, 25], keys: ['frankfurt', 'deutsche bank park'], venueName: 'Deutsche Bank Park', city: 'Frankfurt', lat: 50.0686, lng: 8.6455, tz: 'ET' },
  { sportIds: [2, 25], keys: ['sao paulo', 'são paulo', 'arena corinthians'], venueName: 'Arena Corinthians', city: 'Sao Paulo', lat: -23.5453, lng: -46.4742, tz: 'ET' },
  // WNBA
  { sportIds: [8], keys: ['atlanta dream', 'dream'], venueName: 'State Farm Arena', city: 'Atlanta', lat: 33.757, lng: -84.396, tz: 'ET' },
  { sportIds: [8], keys: ['chicago sky', 'sky'], venueName: 'Wintrust Arena', city: 'Chicago', lat: 41.853, lng: -87.621, tz: 'CT' },
  { sportIds: [8], keys: ['connecticut sun', 'sun'], venueName: 'Mohegan Sun Arena', city: 'Uncasville', lat: 41.491, lng: -72.088, tz: 'ET' },
  { sportIds: [8], keys: ['dallas wings', 'wings'], venueName: 'College Park Center', city: 'Arlington', lat: 32.730, lng: -97.108, tz: 'CT' },
  { sportIds: [8], keys: ['golden state valkyries', 'valkyries'], venueName: 'Chase Center', city: 'San Francisco', lat: 37.768, lng: -122.387, tz: 'PT' },
  { sportIds: [8], keys: ['indiana fever', 'fever'], venueName: 'Gainbridge Fieldhouse', city: 'Indianapolis', lat: 39.764, lng: -86.155, tz: 'ET' },
  { sportIds: [8], keys: ['las vegas aces', 'aces'], venueName: 'Michelob Ultra Arena', city: 'Las Vegas', lat: 36.091, lng: -115.184, tz: 'PT' },
  { sportIds: [8], keys: ['los angeles sparks', 'sparks'], venueName: 'Crypto.com Arena', city: 'Los Angeles', lat: 34.043, lng: -118.267, tz: 'PT' },
  { sportIds: [8], keys: ['minnesota lynx', 'lynx'], venueName: 'Target Center', city: 'Minneapolis', lat: 44.979, lng: -93.276, tz: 'CT' },
  { sportIds: [8], keys: ['new york liberty', 'liberty'], venueName: 'Barclays Center', city: 'Brooklyn', lat: 40.683, lng: -73.975, tz: 'ET' },
  { sportIds: [8], keys: ['phoenix mercury', 'mercury'], venueName: 'Footprint Center', city: 'Phoenix', lat: 33.446, lng: -112.071, tz: 'MT' },
  { sportIds: [8], keys: ['seattle storm', 'storm'], venueName: 'Climate Pledge Arena', city: 'Seattle', lat: 47.622, lng: -122.354, tz: 'PT' },
  { sportIds: [8], keys: ['washington mystics', 'mystics'], venueName: 'Entertainment and Sports Arena', city: 'Washington', lat: 38.868, lng: -76.978, tz: 'ET' },
  // NHL (32 franchises — shared buildings with NBA/MLB where applicable)
  { sportIds: [6], keys: ['anaheim ducks', 'ducks'], venueName: 'Honda Center', city: 'Anaheim', lat: 33.808, lng: -117.877, tz: 'PT' },
  { sportIds: [6], keys: ['arizona coyotes', 'coyotes'], venueName: 'Mullett Arena', city: 'Tempe', lat: 33.427, lng: -111.931, tz: 'MT' },
  { sportIds: [6], keys: ['boston bruins', 'bruins'], venueName: 'TD Garden', city: 'Boston', lat: 42.366, lng: -71.062, tz: 'ET' },
  { sportIds: [6], keys: ['buffalo sabres', 'sabres'], venueName: 'KeyBank Center', city: 'Buffalo', lat: 42.875, lng: -78.876, tz: 'ET' },
  { sportIds: [6], keys: ['calgary flames', 'flames'], venueName: 'Scotiabank Saddledome', city: 'Calgary', lat: 51.037, lng: -114.052, tz: 'MT' },
  { sportIds: [6], keys: ['carolina hurricanes', 'hurricanes'], venueName: 'Lenovo Center', city: 'Raleigh', lat: 35.803, lng: -78.722, tz: 'ET' },
  { sportIds: [6], keys: ['chicago blackhawks', 'blackhawks'], venueName: 'United Center', city: 'Chicago', lat: 41.881, lng: -87.674, tz: 'CT' },
  { sportIds: [6], keys: ['colorado avalanche', 'avalanche'], venueName: 'Ball Arena', city: 'Denver', lat: 39.748, lng: -105.007, tz: 'MT' },
  { sportIds: [6], keys: ['columbus blue jackets', 'blue jackets'], venueName: 'Nationwide Arena', city: 'Columbus', lat: 39.969, lng: -83.006, tz: 'ET' },
  { sportIds: [6], keys: ['dallas stars', 'stars'], venueName: 'American Airlines Center', city: 'Dallas', lat: 32.790, lng: -96.810, tz: 'CT' },
  { sportIds: [6], keys: ['detroit red wings', 'red wings'], venueName: 'Little Caesars Arena', city: 'Detroit', lat: 42.341, lng: -83.055, tz: 'ET' },
  { sportIds: [6], keys: ['edmonton oilers', 'oilers'], venueName: 'Rogers Place', city: 'Edmonton', lat: 53.547, lng: -113.498, tz: 'MT' },
  { sportIds: [6], keys: ['florida panthers', 'panthers nhl'], venueName: 'Amerant Bank Arena', city: 'Sunrise', lat: 26.158, lng: -80.326, tz: 'ET' },
  { sportIds: [6], keys: ['los angeles kings', 'kings nhl'], venueName: 'Crypto.com Arena', city: 'Los Angeles', lat: 34.043, lng: -118.267, tz: 'PT' },
  { sportIds: [6], keys: ['minnesota wild', 'wild'], venueName: 'Xcel Energy Center', city: 'St. Paul', lat: 44.945, lng: -93.101, tz: 'CT' },
  { sportIds: [6], keys: ['montreal canadiens', 'canadiens'], venueName: 'Bell Centre', city: 'Montreal', lat: 45.496, lng: -73.569, tz: 'ET' },
  { sportIds: [6], keys: ['nashville predators', 'predators'], venueName: 'Bridgestone Arena', city: 'Nashville', lat: 36.159, lng: -86.778, tz: 'CT' },
  { sportIds: [6], keys: ['new jersey devils', 'devils'], venueName: 'Prudential Center', city: 'Newark', lat: 40.734, lng: -74.171, tz: 'ET' },
  { sportIds: [6], keys: ['new york islanders', 'islanders'], venueName: 'UBS Arena', city: 'Elmont', lat: 40.711, lng: -73.726, tz: 'ET' },
  { sportIds: [6], keys: ['new york rangers', 'rangers'], venueName: 'Madison Square Garden', city: 'New York', lat: 40.750, lng: -73.993, tz: 'ET' },
  { sportIds: [6], keys: ['ottawa senators', 'senators'], venueName: 'Canadian Tire Centre', city: 'Ottawa', lat: 45.297, lng: -75.927, tz: 'ET' },
  { sportIds: [6], keys: ['philadelphia flyers', 'flyers'], venueName: 'Wells Fargo Center', city: 'Philadelphia', lat: 39.901, lng: -75.172, tz: 'ET' },
  { sportIds: [6], keys: ['pittsburgh penguins', 'penguins'], venueName: 'PPG Paints Arena', city: 'Pittsburgh', lat: 40.439, lng: -79.984, tz: 'ET' },
  { sportIds: [6], keys: ['san jose sharks', 'sharks'], venueName: 'SAP Center', city: 'San Jose', lat: 37.332, lng: -121.901, tz: 'PT' },
  { sportIds: [6], keys: ['seattle kraken', 'kraken'], venueName: 'Climate Pledge Arena', city: 'Seattle', lat: 47.622, lng: -122.354, tz: 'PT' },
  { sportIds: [6], keys: ['st louis blues', 'blues'], venueName: 'Enterprise Center', city: 'St. Louis', lat: 38.627, lng: -90.203, tz: 'CT' },
  { sportIds: [6], keys: ['tampa bay lightning', 'lightning'], venueName: 'Amalie Arena', city: 'Tampa', lat: 27.943, lng: -82.452, tz: 'ET' },
  { sportIds: [6], keys: ['toronto maple leafs', 'maple leafs'], venueName: 'Scotiabank Arena', city: 'Toronto', lat: 43.643, lng: -79.379, tz: 'ET' },
  { sportIds: [6], keys: ['utah hockey club', 'utah mammoth'], venueName: 'Delta Center', city: 'Salt Lake City', lat: 40.768, lng: -111.901, tz: 'MT' },
  { sportIds: [6], keys: ['vancouver canucks', 'canucks'], venueName: 'Rogers Arena', city: 'Vancouver', lat: 49.277, lng: -123.109, tz: 'PT' },
  { sportIds: [6], keys: ['vegas golden knights', 'golden knights'], venueName: 'T-Mobile Arena', city: 'Las Vegas', lat: 36.103, lng: -115.178, tz: 'PT' },
  { sportIds: [6], keys: ['washington capitals', 'capitals'], venueName: 'Capital One Arena', city: 'Washington', lat: 38.898, lng: -77.021, tz: 'ET' },
  { sportIds: [6], keys: ['winnipeg jets', 'jets nhl'], venueName: 'Canada Life Centre', city: 'Winnipeg', lat: 49.893, lng: -97.143, tz: 'CT' },
  // NCAAF (FBS)
  { sportIds: [1], keys: ['alabama crimson tide', 'alabama'], venueName: 'Bryant-Denny Stadium', city: 'Tuscaloosa', lat: 33.208, lng: -87.550, tz: 'CT' },
  { sportIds: [1], keys: ['georgia bulldogs', 'georgia'], venueName: 'Sanford Stadium', city: 'Athens', lat: 33.950, lng: -83.373, tz: 'ET' },
  { sportIds: [1], keys: ['ohio state buckeyes', 'ohio state', 'buckeyes'], venueName: 'Ohio Stadium', city: 'Columbus', lat: 40.002, lng: -83.020, tz: 'ET' },
  { sportIds: [1], keys: ['michigan wolverines', 'michigan'], venueName: 'Michigan Stadium', city: 'Ann Arbor', lat: 42.266, lng: -83.749, tz: 'ET' },
  { sportIds: [1], keys: ['texas longhorns', 'texas'], venueName: 'DKR-Texas Memorial Stadium', city: 'Austin', lat: 30.284, lng: -97.732, tz: 'CT' },
  { sportIds: [1], keys: ['oregon ducks', 'oregon'], venueName: 'Autzen Stadium', city: 'Eugene', lat: 44.058, lng: -123.068, tz: 'PT' },
  { sportIds: [1], keys: ['penn state nittany lions', 'penn state'], venueName: 'Beaver Stadium', city: 'State College', lat: 40.812, lng: -77.856, tz: 'ET' },
  { sportIds: [1], keys: ['lsu tigers', 'lsu'], venueName: 'Tiger Stadium', city: 'Baton Rouge', lat: 30.412, lng: -91.184, tz: 'CT' },
  { sportIds: [1], keys: ['clemson tigers', 'clemson'], venueName: 'Memorial Stadium', city: 'Clemson', lat: 34.678, lng: -82.843, tz: 'ET' },
  { sportIds: [1], keys: ['florida gators', 'florida'], venueName: 'Ben Hill Griffin Stadium', city: 'Gainesville', lat: 29.650, lng: -82.348, tz: 'ET' },
  { sportIds: [1], keys: ['usc trojans', 'southern california trojans', 'usc'], venueName: 'LA Memorial Coliseum', city: 'Los Angeles', lat: 34.014, lng: -118.288, tz: 'PT' },
  { sportIds: [1], keys: ['notre dame fighting irish', 'notre dame'], venueName: 'Notre Dame Stadium', city: 'Notre Dame', lat: 41.698, lng: -86.234, tz: 'ET' },
  { sportIds: [1], keys: ['oklahoma sooners', 'oklahoma'], venueName: 'Gaylord Family Oklahoma Memorial Stadium', city: 'Norman', lat: 35.206, lng: -97.442, tz: 'CT' },
  { sportIds: [1], keys: ['tennessee volunteers', 'tennessee'], venueName: 'Neyland Stadium', city: 'Knoxville', lat: 35.955, lng: -83.926, tz: 'ET' },
  { sportIds: [1], keys: ['texas a m aggies', 'texas a&m aggies', 'texas am aggies'], venueName: 'Kyle Field', city: 'College Station', lat: 30.610, lng: -96.341, tz: 'CT' },
  { sportIds: [1], keys: ['auburn tigers', 'auburn'], venueName: 'Jordan-Hare Stadium', city: 'Auburn', lat: 32.602, lng: -85.489, tz: 'CT' },
  { sportIds: [1], keys: ['florida state seminoles', 'florida state'], venueName: 'Doak Campbell Stadium', city: 'Tallahassee', lat: 30.438, lng: -84.304, tz: 'ET' },
  { sportIds: [1], keys: ['miami hurricanes', 'miami fl'], venueName: 'Hard Rock Stadium', city: 'Miami Gardens', lat: 25.958, lng: -80.239, tz: 'ET' },
  { sportIds: [1], keys: ['wisconsin badgers', 'wisconsin'], venueName: 'Camp Randall Stadium', city: 'Madison', lat: 43.070, lng: -89.413, tz: 'CT' },
  { sportIds: [1], keys: ['iowa hawkeyes', 'iowa'], venueName: 'Kinnick Stadium', city: 'Iowa City', lat: 41.659, lng: -91.551, tz: 'CT' },
  { sportIds: [1], keys: ['nebraska cornhuskers', 'nebraska'], venueName: 'Memorial Stadium', city: 'Lincoln', lat: 40.821, lng: -96.706, tz: 'CT' },
  { sportIds: [1], keys: ['ucla bruins', 'ucla'], venueName: 'Rose Bowl', city: 'Pasadena', lat: 34.161, lng: -118.168, tz: 'PT' },
  { sportIds: [1], keys: ['washington huskies', 'washington'], venueName: 'Husky Stadium', city: 'Seattle', lat: 47.650, lng: -122.303, tz: 'PT' },
  { sportIds: [1], keys: ['oregon state beavers', 'oregon state'], venueName: 'Reser Stadium', city: 'Corvallis', lat: 44.559, lng: -123.281, tz: 'PT' },
  { sportIds: [1], keys: ['colorado buffaloes', 'colorado'], venueName: 'Folsom Field', city: 'Boulder', lat: 40.009, lng: -105.267, tz: 'MT' },
  { sportIds: [1], keys: ['utah utes', 'utah'], venueName: 'Rice-Eccles Stadium', city: 'Salt Lake City', lat: 40.762, lng: -111.849, tz: 'MT' },
  { sportIds: [1], keys: ['arizona wildcats', 'arizona'], venueName: 'Arizona Stadium', city: 'Tucson', lat: 32.232, lng: -110.951, tz: 'MT' },
  { sportIds: [1], keys: ['arizona state sun devils', 'arizona state'], venueName: 'Mountain America Stadium', city: 'Tempe', lat: 33.426, lng: -111.933, tz: 'MT' },
  { sportIds: [1], keys: ['kansas state wildcats', 'kansas state'], venueName: 'Bill Snyder Family Stadium', city: 'Manhattan', lat: 39.202, lng: -96.591, tz: 'CT' },
  { sportIds: [1], keys: ['oklahoma state cowboys', 'oklahoma state'], venueName: 'Boone Pickens Stadium', city: 'Stillwater', lat: 36.126, lng: -97.066, tz: 'CT' },
  { sportIds: [1], keys: ['tcu horned frogs', 'tcu'], venueName: 'Amon G. Carter Stadium', city: 'Fort Worth', lat: 32.710, lng: -97.368, tz: 'CT' },
  { sportIds: [1], keys: ['baylor bears', 'baylor'], venueName: 'McLane Stadium', city: 'Waco', lat: 31.558, lng: -97.189, tz: 'CT' },
  { sportIds: [1], keys: ['houston cougars', 'houston'], venueName: 'TDECU Stadium', city: 'Houston', lat: 29.722, lng: -95.349, tz: 'CT' },
  { sportIds: [1], keys: ['byu cougars', 'byu'], venueName: 'LaVell Edwards Stadium', city: 'Provo', lat: 40.258, lng: -111.654, tz: 'MT' },
  { sportIds: [1], keys: ['ucf knights', 'ucf'], venueName: 'FBC Mortgage Stadium', city: 'Orlando', lat: 28.609, lng: -81.192, tz: 'ET' },
  { sportIds: [1], keys: ['louisville cardinals', 'louisville'], venueName: 'L&N Federal Credit Union Stadium', city: 'Louisville', lat: 38.206, lng: -85.759, tz: 'ET' },
  { sportIds: [1], keys: ['kentucky wildcats', 'kentucky'], venueName: 'Kroger Field', city: 'Lexington', lat: 38.019, lng: -84.505, tz: 'ET' },
  { sportIds: [1], keys: ['arkansas razorbacks', 'arkansas'], venueName: 'Donald W. Reynolds Razorback Stadium', city: 'Fayetteville', lat: 36.068, lng: -94.179, tz: 'CT' },
  { sportIds: [1], keys: ['ole miss rebels', 'mississippi rebels', 'ole miss', 'mississippi'], venueName: 'Vaught-Hemingway Stadium', city: 'Oxford', lat: 34.362, lng: -89.537, tz: 'CT' },
  { sportIds: [1], keys: ['mississippi state bulldogs', 'mississippi state'], venueName: 'Davis Wade Stadium', city: 'Starkville', lat: 33.456, lng: -88.794, tz: 'CT' },
  { sportIds: [1], keys: ['south carolina gamecocks', 'south carolina'], venueName: 'Williams-Brice Stadium', city: 'Columbia', lat: 33.973, lng: -81.019, tz: 'ET' },
  { sportIds: [1], keys: ['north carolina tar heels', 'north carolina'], venueName: 'Kenan Memorial Stadium', city: 'Chapel Hill', lat: 35.967, lng: -79.051, tz: 'ET' },
  { sportIds: [1], keys: ['nc state wolfpack', 'north carolina state'], venueName: 'Carter-Finley Stadium', city: 'Raleigh', lat: 35.741, lng: -78.682, tz: 'ET' },
  { sportIds: [1], keys: ['virginia tech hokies', 'virginia tech'], venueName: 'Lane Stadium', city: 'Blacksburg', lat: 37.220, lng: -80.418, tz: 'ET' },
  { sportIds: [1], keys: ['pittsburgh panthers', 'pitt'], venueName: 'Acrisure Stadium', city: 'Pittsburgh', lat: 40.447, lng: -80.015, tz: 'ET' },
  { sportIds: [1], keys: ['west virginia mountaineers', 'west virginia'], venueName: 'Milan Puskar Stadium', city: 'Morgantown', lat: 39.650, lng: -79.955, tz: 'ET' },
  { sportIds: [1], keys: ['cincinnati bearcats', 'cincinnati'], venueName: 'Nippert Stadium', city: 'Cincinnati', lat: 39.131, lng: -84.516, tz: 'ET' },
  { sportIds: [1], keys: ['boise state broncos', 'boise state'], venueName: 'Albertsons Stadium', city: 'Boise', lat: 43.603, lng: -116.196, tz: 'MT' },
  { sportIds: [1], keys: ['michigan state spartans', 'michigan state'], venueName: 'Spartan Stadium', city: 'East Lansing', lat: 42.728, lng: -84.485, tz: 'ET' },
  { sportIds: [1], keys: ['washington state cougars', 'washington state'], venueName: 'Martin Stadium', city: 'Pullman', lat: 46.732, lng: -117.163, tz: 'PT' },
  { sportIds: [1], keys: ['stanford cardinal', 'stanford'], venueName: 'Stanford Stadium', city: 'Stanford', lat: 37.434, lng: -122.161, tz: 'PT' },
  { sportIds: [1], keys: ['california golden bears', 'california'], venueName: 'California Memorial Stadium', city: 'Berkeley', lat: 37.871, lng: -122.251, tz: 'PT' },
  { sportIds: [1], keys: ['missouri tigers', 'missouri'], venueName: 'Faurot Field', city: 'Columbia', lat: 38.942, lng: -92.333, tz: 'CT' },
  { sportIds: [1], keys: ['minnesota golden gophers', 'minnesota'], venueName: 'Huntington Bank Stadium', city: 'Minneapolis', lat: 44.977, lng: -93.225, tz: 'CT' },
  { sportIds: [1], keys: ['illinois fighting illini', 'illinois'], venueName: 'Memorial Stadium', city: 'Champaign', lat: 40.099, lng: -88.236, tz: 'CT' },
  { sportIds: [1], keys: ['indiana hoosiers', 'indiana'], venueName: 'Memorial Stadium', city: 'Bloomington', lat: 39.181, lng: -86.526, tz: 'ET' },
  { sportIds: [1], keys: ['purdue boilermakers', 'purdue'], venueName: 'Ross-Ade Stadium', city: 'West Lafayette', lat: 40.435, lng: -86.918, tz: 'ET' },
  { sportIds: [1], keys: ['maryland terrapins', 'maryland'], venueName: 'SECU Stadium', city: 'College Park', lat: 38.990, lng: -76.947, tz: 'ET' },
  { sportIds: [1], keys: ['rutgers scarlet knights', 'rutgers'], venueName: 'SHI Stadium', city: 'Piscataway', lat: 40.513, lng: -74.465, tz: 'ET' },
  { sportIds: [1], keys: ['syracuse orange', 'syracuse'], venueName: 'JMA Wireless Dome', city: 'Syracuse', lat: 43.037, lng: -76.136, tz: 'ET' },
  { sportIds: [1], keys: ['boston college eagles', 'boston college'], venueName: 'Alumni Stadium', city: 'Chestnut Hill', lat: 42.335, lng: -71.166, tz: 'ET' },
  { sportIds: [1], keys: ['virginia cavaliers', 'virginia'], venueName: 'Scott Stadium', city: 'Charlottesville', lat: 38.031, lng: -78.514, tz: 'ET' },
  { sportIds: [1], keys: ['duke blue devils', 'duke'], venueName: 'Wallace Wade Stadium', city: 'Durham', lat: 35.995, lng: -78.942, tz: 'ET' },
  { sportIds: [1], keys: ['wake forest demon deacons', 'wake forest'], venueName: 'Truist Field', city: 'Winston-Salem', lat: 36.130, lng: -80.255, tz: 'ET' },
  { sportIds: [1], keys: ['georgia tech yellow jackets', 'georgia tech'], venueName: 'Bobby Dodd Stadium', city: 'Atlanta', lat: 33.772, lng: -84.392, tz: 'ET' },
  { sportIds: [1], keys: ['smu mustangs', 'smu'], venueName: 'Gerald J. Ford Stadium', city: 'Dallas', lat: 32.838, lng: -96.784, tz: 'CT' },
  { sportIds: [1], keys: ['tulane green wave', 'tulane'], venueName: 'Yulman Stadium', city: 'New Orleans', lat: 29.944, lng: -90.120, tz: 'CT' },
  { sportIds: [1], keys: ['memphis tigers', 'memphis'], venueName: 'Simmons Bank Liberty Stadium', city: 'Memphis', lat: 35.121, lng: -89.977, tz: 'CT' },
  { sportIds: [1], keys: ['army black knights', 'army'], venueName: 'Michie Stadium', city: 'West Point', lat: 41.388, lng: -73.964, tz: 'ET' },
  { sportIds: [1], keys: ['navy midshipmen', 'navy'], venueName: 'Navy-Marine Corps Memorial Stadium', city: 'Annapolis', lat: 38.985, lng: -76.507, tz: 'ET' },
  { sportIds: [1], keys: ['air force falcons', 'air force'], venueName: 'Falcon Stadium', city: 'Colorado Springs', lat: 38.996, lng: -104.843, tz: 'MT' },
  { sportIds: [1], keys: ['kansas jayhawks', 'kansas'], venueName: 'David Booth Kansas Memorial Stadium', city: 'Lawrence', lat: 38.954, lng: -95.255, tz: 'CT' },
  { sportIds: [1], keys: ['iowa state cyclones', 'iowa state'], venueName: 'Jack Trice Stadium', city: 'Ames', lat: 42.014, lng: -93.636, tz: 'CT' },
  { sportIds: [1], keys: ['texas tech red raiders', 'texas tech'], venueName: 'Jones AT&T Stadium', city: 'Lubbock', lat: 33.589, lng: -101.872, tz: 'CT' },
  { sportIds: [1], keys: ['north texas mean green', 'north texas'], venueName: 'DATCU Stadium', city: 'Denton', lat: 33.209, lng: -97.156, tz: 'CT' },
  { sportIds: [1], keys: ['utsa roadrunners', 'utsa'], venueName: 'Alamodome', city: 'San Antonio', lat: 29.417, lng: -98.479, tz: 'CT' },
  { sportIds: [1], keys: ['fresno state bulldogs', 'fresno state'], venueName: 'Valley Children\'s Stadium', city: 'Fresno', lat: 36.814, lng: -119.758, tz: 'PT' },
  { sportIds: [1], keys: ['san diego state aztecs', 'san diego state'], venueName: 'Snapdragon Stadium', city: 'San Diego', lat: 32.784, lng: -117.122, tz: 'PT' },
  { sportIds: [1], keys: ['unlv rebels', 'unlv'], venueName: 'Allegiant Stadium', city: 'Las Vegas', lat: 36.091, lng: -115.184, tz: 'PT' },
  { sportIds: [1], keys: ['hawaii rainbow warriors', 'hawaii'], venueName: 'Clarence T.C. Ching Athletics Complex', city: 'Honolulu', lat: 21.372, lng: -157.824, tz: 'PT' },
  // NCAAB (power + high-volume conferences)
  { sportIds: [5], keys: ['boston college eagles', 'boston college'], venueName: 'Conte Forum', city: 'Chestnut Hill', lat: 42.335, lng: -71.170, tz: 'ET' },
  { sportIds: [5], keys: ['california golden bears', 'california', 'cal golden bears'], venueName: 'Haas Pavilion', city: 'Berkeley', lat: 37.870, lng: -122.262, tz: 'PT' },
  { sportIds: [5], keys: ['clemson tigers', 'clemson'], venueName: 'Littlejohn Coliseum', city: 'Clemson', lat: 34.678, lng: -82.843, tz: 'ET' },
  { sportIds: [5], keys: ['duke blue devils', 'duke'], venueName: 'Cameron Indoor Stadium', city: 'Durham', lat: 36.001, lng: -78.940, tz: 'ET' },
  { sportIds: [5], keys: ['florida state seminoles', 'florida state'], venueName: 'Donald L. Tucker Civic Center', city: 'Tallahassee', lat: 30.438, lng: -84.281, tz: 'ET' },
  { sportIds: [5], keys: ['georgia tech yellow jackets', 'georgia tech'], venueName: 'McCamish Pavilion', city: 'Atlanta', lat: 33.771, lng: -84.392, tz: 'ET' },
  { sportIds: [5], keys: ['louisville cardinals', 'louisville'], venueName: 'KFC Yum! Center', city: 'Louisville', lat: 38.257, lng: -85.756, tz: 'ET' },
  { sportIds: [5], keys: ['miami hurricanes', 'miami fl'], venueName: 'Watsco Center', city: 'Coral Gables', lat: 25.721, lng: -80.279, tz: 'ET' },
  { sportIds: [5], keys: ['nc state wolfpack', 'north carolina state', 'nc state'], venueName: 'Lenovo Center', city: 'Raleigh', lat: 35.803, lng: -78.722, tz: 'ET' },
  { sportIds: [5], keys: ['north carolina tar heels', 'north carolina'], venueName: 'Dean E. Smith Center', city: 'Chapel Hill', lat: 35.905, lng: -79.046, tz: 'ET' },
  { sportIds: [5], keys: ['notre dame fighting irish', 'notre dame'], venueName: 'Purcell Pavilion', city: 'Notre Dame', lat: 41.699, lng: -86.235, tz: 'ET' },
  { sportIds: [5], keys: ['pittsburgh panthers', 'pitt'], venueName: 'Petersen Events Center', city: 'Pittsburgh', lat: 40.442, lng: -79.960, tz: 'ET' },
  { sportIds: [5], keys: ['smu mustangs', 'smu'], venueName: 'Moody Coliseum', city: 'Dallas', lat: 32.838, lng: -96.776, tz: 'CT' },
  { sportIds: [5], keys: ['stanford cardinal', 'stanford'], venueName: 'Maples Pavilion', city: 'Stanford', lat: 37.434, lng: -122.161, tz: 'PT' },
  { sportIds: [5], keys: ['syracuse orange', 'syracuse'], venueName: 'JMA Wireless Dome', city: 'Syracuse', lat: 43.037, lng: -76.136, tz: 'ET' },
  { sportIds: [5], keys: ['virginia cavaliers', 'virginia'], venueName: 'John Paul Jones Arena', city: 'Charlottesville', lat: 38.046, lng: -78.507, tz: 'ET' },
  { sportIds: [5], keys: ['virginia tech hokies', 'virginia tech'], venueName: 'Cassell Coliseum', city: 'Blacksburg', lat: 37.220, lng: -80.418, tz: 'ET' },
  { sportIds: [5], keys: ['wake forest demon deacons', 'wake forest'], venueName: 'LJVM Coliseum', city: 'Winston-Salem', lat: 36.127, lng: -80.255, tz: 'ET' },
  { sportIds: [5], keys: ['illinois fighting illini', 'illinois'], venueName: 'State Farm Center', city: 'Champaign', lat: 40.096, lng: -88.236, tz: 'CT' },
  { sportIds: [5], keys: ['indiana hoosiers', 'indiana'], venueName: 'Simon Skjodt Assembly Hall', city: 'Bloomington', lat: 39.181, lng: -86.525, tz: 'ET' },
  { sportIds: [5], keys: ['iowa hawkeyes', 'iowa'], venueName: 'Carver-Hawkeye Arena', city: 'Iowa City', lat: 41.663, lng: -91.552, tz: 'CT' },
  { sportIds: [5], keys: ['maryland terrapins', 'maryland'], venueName: 'Xfinity Center', city: 'College Park', lat: 38.995, lng: -76.941, tz: 'ET' },
  { sportIds: [5], keys: ['michigan wolverines', 'michigan'], venueName: 'Crisler Center', city: 'Ann Arbor', lat: 42.265, lng: -83.748, tz: 'ET' },
  { sportIds: [5], keys: ['michigan state spartans', 'michigan state'], venueName: 'Breslin Student Events Center', city: 'East Lansing', lat: 42.734, lng: -84.483, tz: 'ET' },
  { sportIds: [5], keys: ['minnesota golden gophers', 'minnesota'], venueName: 'Williams Arena', city: 'Minneapolis', lat: 44.978, lng: -93.228, tz: 'CT' },
  { sportIds: [5], keys: ['nebraska cornhuskers', 'nebraska'], venueName: 'Pinnacle Bank Arena', city: 'Lincoln', lat: 40.808, lng: -96.707, tz: 'CT' },
  { sportIds: [5], keys: ['northwestern wildcats', 'northwestern'], venueName: 'Welsh-Ryan Arena', city: 'Evanston', lat: 42.058, lng: -87.673, tz: 'CT' },
  { sportIds: [5], keys: ['ohio state buckeyes', 'ohio state'], venueName: 'Value City Arena', city: 'Columbus', lat: 40.008, lng: -83.029, tz: 'ET' },
  { sportIds: [5], keys: ['oregon ducks', 'oregon'], venueName: 'Matthew Knight Arena', city: 'Eugene', lat: 44.045, lng: -123.068, tz: 'PT' },
  { sportIds: [5], keys: ['penn state nittany lions', 'penn state'], venueName: 'Bryce Jordan Center', city: 'University Park', lat: 40.808, lng: -77.856, tz: 'ET' },
  { sportIds: [5], keys: ['purdue boilermakers', 'purdue'], venueName: 'Mackey Arena', city: 'West Lafayette', lat: 40.424, lng: -86.916, tz: 'ET' },
  { sportIds: [5], keys: ['rutgers scarlet knights', 'rutgers'], venueName: 'Jersey Mike\'s Arena', city: 'Piscataway', lat: 40.513, lng: -74.465, tz: 'ET' },
  { sportIds: [5], keys: ['ucla bruins', 'ucla'], venueName: 'Pauley Pavilion', city: 'Los Angeles', lat: 34.070, lng: -118.444, tz: 'PT' },
  { sportIds: [5], keys: ['usc trojans', 'southern california trojans', 'usc'], venueName: 'Galen Center', city: 'Los Angeles', lat: 34.022, lng: -118.285, tz: 'PT' },
  { sportIds: [5], keys: ['washington huskies', 'washington'], venueName: 'Alaska Airlines Arena', city: 'Seattle', lat: 47.655, lng: -122.303, tz: 'PT' },
  { sportIds: [5], keys: ['wisconsin badgers', 'wisconsin'], venueName: 'Kohl Center', city: 'Madison', lat: 43.070, lng: -89.412, tz: 'CT' },
  { sportIds: [5], keys: ['arizona wildcats', 'arizona'], venueName: 'McKale Center', city: 'Tucson', lat: 32.235, lng: -110.951, tz: 'MT' },
  { sportIds: [5], keys: ['arizona state sun devils', 'arizona state'], venueName: 'Desert Financial Arena', city: 'Tempe', lat: 33.426, lng: -111.931, tz: 'MT' },
  { sportIds: [5], keys: ['byu cougars', 'byu'], venueName: 'Marriott Center', city: 'Provo', lat: 40.251, lng: -111.652, tz: 'MT' },
  { sportIds: [5], keys: ['baylor bears', 'baylor'], venueName: 'Foster Pavilion', city: 'Waco', lat: 31.548, lng: -97.116, tz: 'CT' },
  { sportIds: [5], keys: ['cincinnati bearcats', 'cincinnati'], venueName: 'Fifth Third Arena', city: 'Cincinnati', lat: 39.132, lng: -84.516, tz: 'ET' },
  { sportIds: [5], keys: ['colorado buffaloes', 'colorado'], venueName: 'CU Events Center', city: 'Boulder', lat: 40.008, lng: -105.267, tz: 'MT' },
  { sportIds: [5], keys: ['houston cougars', 'houston'], venueName: 'Fertitta Center', city: 'Houston', lat: 29.719, lng: -95.343, tz: 'CT' },
  { sportIds: [5], keys: ['iowa state cyclones', 'iowa state'], venueName: 'Hilton Coliseum', city: 'Ames', lat: 42.021, lng: -93.634, tz: 'CT' },
  { sportIds: [5], keys: ['kansas jayhawks', 'kansas'], venueName: 'Allen Fieldhouse', city: 'Lawrence', lat: 38.954, lng: -95.252, tz: 'CT' },
  { sportIds: [5], keys: ['kansas state wildcats', 'kansas state'], venueName: 'Bramlage Coliseum', city: 'Manhattan', lat: 39.192, lng: -96.591, tz: 'CT' },
  { sportIds: [5], keys: ['oklahoma state cowboys', 'oklahoma state'], venueName: 'Gallagher-Iba Arena', city: 'Stillwater', lat: 36.125, lng: -97.066, tz: 'CT' },
  { sportIds: [5], keys: ['tcu horned frogs', 'tcu'], venueName: 'Schollmaier Arena', city: 'Fort Worth', lat: 32.709, lng: -97.361, tz: 'CT' },
  { sportIds: [5], keys: ['texas tech red raiders', 'texas tech'], venueName: 'United Supermarkets Arena', city: 'Lubbock', lat: 33.589, lng: -101.872, tz: 'CT' },
  { sportIds: [5], keys: ['ucf knights', 'ucf'], venueName: 'Addition Financial Arena', city: 'Orlando', lat: 28.602, lng: -81.200, tz: 'ET' },
  { sportIds: [5], keys: ['utah utes', 'utah'], venueName: 'Jon M. Huntsman Center', city: 'Salt Lake City', lat: 40.762, lng: -111.849, tz: 'MT' },
  { sportIds: [5], keys: ['west virginia mountaineers', 'west virginia'], venueName: 'WVU Coliseum', city: 'Morgantown', lat: 39.649, lng: -79.955, tz: 'ET' },
  { sportIds: [5], keys: ['alabama crimson tide', 'alabama'], venueName: 'Coleman Coliseum', city: 'Tuscaloosa', lat: 33.204, lng: -87.539, tz: 'CT' },
  { sportIds: [5], keys: ['arkansas razorbacks', 'arkansas'], venueName: 'Bud Walton Arena', city: 'Fayetteville', lat: 36.062, lng: -94.178, tz: 'CT' },
  { sportIds: [5], keys: ['auburn tigers', 'auburn'], venueName: 'Neville Arena', city: 'Auburn', lat: 32.602, lng: -85.489, tz: 'CT' },
  { sportIds: [5], keys: ['florida gators', 'florida'], venueName: 'Stephen C. O\'Connell Center', city: 'Gainesville', lat: 29.650, lng: -82.347, tz: 'ET' },
  { sportIds: [5], keys: ['georgia bulldogs', 'georgia'], venueName: 'Stegeman Coliseum', city: 'Athens', lat: 33.942, lng: -83.375, tz: 'ET' },
  { sportIds: [5], keys: ['kentucky wildcats', 'kentucky'], venueName: 'Rupp Arena', city: 'Lexington', lat: 38.049, lng: -84.503, tz: 'ET' },
  { sportIds: [5], keys: ['lsu tigers', 'lsu'], venueName: 'Pete Maravich Assembly Center', city: 'Baton Rouge', lat: 30.414, lng: -91.185, tz: 'CT' },
  { sportIds: [5], keys: ['mississippi state bulldogs', 'mississippi state'], venueName: 'Humphrey Coliseum', city: 'Starkville', lat: 33.456, lng: -88.794, tz: 'CT' },
  { sportIds: [5], keys: ['ole miss rebels', 'mississippi rebels', 'ole miss', 'mississippi'], venueName: 'The Pavilion at Ole Miss', city: 'Oxford', lat: 34.362, lng: -89.537, tz: 'CT' },
  { sportIds: [5], keys: ['missouri tigers', 'missouri'], venueName: 'Mizzou Arena', city: 'Columbia', lat: 38.938, lng: -92.330, tz: 'CT' },
  { sportIds: [5], keys: ['oklahoma sooners', 'oklahoma'], venueName: 'Lloyd Noble Center', city: 'Norman', lat: 35.205, lng: -97.445, tz: 'CT' },
  { sportIds: [5], keys: ['south carolina gamecocks', 'south carolina'], venueName: 'Colonial Life Arena', city: 'Columbia', lat: 33.973, lng: -81.019, tz: 'ET' },
  { sportIds: [5], keys: ['tennessee volunteers', 'tennessee'], venueName: 'Thompson-Boling Arena', city: 'Knoxville', lat: 35.951, lng: -83.929, tz: 'ET' },
  { sportIds: [5], keys: ['texas longhorns', 'texas'], venueName: 'Moody Center', city: 'Austin', lat: 30.281, lng: -97.732, tz: 'CT' },
  { sportIds: [5], keys: ['texas a m aggies', 'texas a&m aggies', 'texas am aggies'], venueName: 'Reed Arena', city: 'College Station', lat: 30.616, lng: -96.341, tz: 'CT' },
  { sportIds: [5], keys: ['vanderbilt commodores', 'vanderbilt'], venueName: 'Memorial Gymnasium', city: 'Nashville', lat: 36.145, lng: -86.807, tz: 'CT' },
  { sportIds: [5], keys: ['butler bulldogs', 'butler'], venueName: 'Hinkle Fieldhouse', city: 'Indianapolis', lat: 39.841, lng: -86.172, tz: 'ET' },
  { sportIds: [5], keys: ['uconn huskies', 'connecticut huskies', 'uconn'], venueName: 'Gampel Pavilion', city: 'Storrs', lat: 41.808, lng: -72.254, tz: 'ET' },
  { sportIds: [5], keys: ['creighton bluejays', 'creighton'], venueName: 'CHI Health Center', city: 'Omaha', lat: 41.263, lng: -95.928, tz: 'CT' },
  { sportIds: [5], keys: ['depaul blue demons', 'depaul'], venueName: 'Wintrust Arena', city: 'Chicago', lat: 41.853, lng: -87.621, tz: 'CT' },
  { sportIds: [5], keys: ['georgetown hoyas', 'georgetown'], venueName: 'Capital One Arena', city: 'Washington', lat: 38.898, lng: -77.021, tz: 'ET' },
  { sportIds: [5], keys: ['marquette golden eagles', 'marquette'], venueName: 'Fiserv Forum', city: 'Milwaukee', lat: 43.045, lng: -87.917, tz: 'CT' },
  { sportIds: [5], keys: ['providence friars', 'providence'], venueName: 'Amica Mutual Pavilion', city: 'Providence', lat: 41.849, lng: -71.401, tz: 'ET' },
  { sportIds: [5], keys: ['seton hall pirates', 'seton hall'], venueName: 'Prudential Center', city: 'Newark', lat: 40.734, lng: -74.171, tz: 'ET' },
  { sportIds: [5], keys: ['st john s red storm', 'st john\'s red storm'], venueName: 'Carnesecca Arena', city: 'Queens', lat: 40.723, lng: -73.794, tz: 'ET' },
  { sportIds: [5], keys: ['villanova wildcats', 'villanova'], venueName: 'Finneran Pavilion', city: 'Villanova', lat: 40.035, lng: -75.336, tz: 'ET' },
  { sportIds: [5], keys: ['xavier musketeers', 'xavier'], venueName: 'Cintas Center', city: 'Cincinnati', lat: 39.150, lng: -84.474, tz: 'ET' },
  { sportIds: [5], keys: ['arizona wildcats', 'arizona'], venueName: 'McKale Center', city: 'Tucson', lat: 32.235, lng: -110.951, tz: 'MT' },
  { sportIds: [5], keys: ['arizona state sun devils', 'arizona state'], venueName: 'Desert Financial Arena', city: 'Tempe', lat: 33.426, lng: -111.931, tz: 'MT' },
  { sportIds: [5], keys: ['california golden bears', 'california', 'cal golden bears'], venueName: 'Haas Pavilion', city: 'Berkeley', lat: 37.870, lng: -122.262, tz: 'PT' },
  { sportIds: [5], keys: ['colorado buffaloes', 'colorado'], venueName: 'CU Events Center', city: 'Boulder', lat: 40.008, lng: -105.267, tz: 'MT' },
  { sportIds: [5], keys: ['oregon ducks', 'oregon'], venueName: 'Matthew Knight Arena', city: 'Eugene', lat: 44.045, lng: -123.068, tz: 'PT' },
  { sportIds: [5], keys: ['oregon state beavers', 'oregon state'], venueName: 'Gill Coliseum', city: 'Corvallis', lat: 44.559, lng: -123.281, tz: 'PT' },
  { sportIds: [5], keys: ['stanford cardinal', 'stanford'], venueName: 'Maples Pavilion', city: 'Stanford', lat: 37.434, lng: -122.161, tz: 'PT' },
  { sportIds: [5], keys: ['ucla bruins', 'ucla'], venueName: 'Pauley Pavilion', city: 'Los Angeles', lat: 34.070, lng: -118.444, tz: 'PT' },
  { sportIds: [5], keys: ['usc trojans', 'southern california trojans', 'usc'], venueName: 'Galen Center', city: 'Los Angeles', lat: 34.022, lng: -118.285, tz: 'PT' },
  { sportIds: [5], keys: ['utah utes', 'utah'], venueName: 'Jon M. Huntsman Center', city: 'Salt Lake City', lat: 40.762, lng: -111.849, tz: 'MT' },
  { sportIds: [5], keys: ['washington huskies', 'washington'], venueName: 'Alaska Airlines Arena', city: 'Seattle', lat: 47.655, lng: -122.303, tz: 'PT' },
  { sportIds: [5], keys: ['washington state cougars', 'washington state'], venueName: 'Beasley Coliseum', city: 'Pullman', lat: 46.732, lng: -117.163, tz: 'PT' },
  { sportIds: [5], keys: ['gonzaga bulldogs', 'gonzaga'], venueName: 'McCarthey Athletic Center', city: 'Spokane', lat: 47.665, lng: -117.426, tz: 'PT' },
  { sportIds: [5], keys: ['loyola marymount lions', 'loyola marymount', 'lmu lions'], venueName: 'Gersten Pavilion', city: 'Los Angeles', lat: 33.969, lng: -118.419, tz: 'PT' },
  { sportIds: [5], keys: ['oregon state beavers', 'oregon state'], venueName: 'Gill Coliseum', city: 'Corvallis', lat: 44.559, lng: -123.281, tz: 'PT' },
  { sportIds: [5], keys: ['pacific tigers', 'pacific'], venueName: 'Alex G. Spanos Center', city: 'Stockton', lat: 37.979, lng: -121.312, tz: 'PT' },
  { sportIds: [5], keys: ['pepperdine waves', 'pepperdine'], venueName: 'Firestone Fieldhouse', city: 'Malibu', lat: 34.039, lng: -118.707, tz: 'PT' },
  { sportIds: [5], keys: ['portland pilots', 'portland'], venueName: 'Chiles Center', city: 'Portland', lat: 45.573, lng: -122.728, tz: 'PT' },
  { sportIds: [5], keys: ['saint mary s gaels', 'saint mary\'s gaels', 'st marys gaels'], venueName: 'University Credit Union Pavilion', city: 'Moraga', lat: 37.844, lng: -122.130, tz: 'PT' },
  { sportIds: [5], keys: ['san diego toreros', 'san diego'], venueName: 'Jenny Craig Pavilion', city: 'San Diego', lat: 32.772, lng: -117.189, tz: 'PT' },
  { sportIds: [5], keys: ['san francisco dons', 'san francisco'], venueName: 'War Memorial Gymnasium', city: 'San Francisco', lat: 37.776, lng: -122.451, tz: 'PT' },
  { sportIds: [5], keys: ['santa clara broncos', 'santa clara'], venueName: 'Leavey Center', city: 'Santa Clara', lat: 37.349, lng: -121.941, tz: 'PT' },
  { sportIds: [5], keys: ['seattle redhawks', 'seattle u redhawks', 'seattle university redhawks', 'seattle u'], venueName: 'Redhawk Center', city: 'Seattle', lat: 47.609, lng: -122.317, tz: 'PT' },
  { sportIds: [5], keys: ['washington state cougars', 'washington state'], venueName: 'Beasley Coliseum', city: 'Pullman', lat: 46.732, lng: -117.163, tz: 'PT' },
  { sportIds: [5], keys: ['air force falcons', 'air force'], venueName: 'Clune Arena', city: 'Colorado Springs', lat: 38.996, lng: -104.843, tz: 'MT' },
  { sportIds: [5], keys: ['boise state broncos', 'boise state'], venueName: 'ExtraMile Arena', city: 'Boise', lat: 43.603, lng: -116.196, tz: 'MT' },
  { sportIds: [5], keys: ['colorado state rams', 'colorado state'], venueName: 'Moby Arena', city: 'Fort Collins', lat: 40.575, lng: -105.081, tz: 'MT' },
  { sportIds: [5], keys: ['fresno state bulldogs', 'fresno state'], venueName: 'Save Mart Center', city: 'Fresno', lat: 36.814, lng: -119.758, tz: 'PT' },
  { sportIds: [5], keys: ['grand canyon antelopes', 'grand canyon lopes', 'grand canyon'], venueName: 'Global Credit Union Arena', city: 'Phoenix', lat: 33.510, lng: -112.129, tz: 'MT' },
  { sportIds: [5], keys: ['nevada wolf pack', 'nevada'], venueName: 'Lawlor Events Center', city: 'Reno', lat: 39.542, lng: -119.814, tz: 'PT' },
  { sportIds: [5], keys: ['new mexico lobos', 'new mexico'], venueName: 'The Pit', city: 'Albuquerque', lat: 35.067, lng: -106.628, tz: 'MT' },
  { sportIds: [5], keys: ['san diego state aztecs', 'san diego state'], venueName: 'Viejas Arena', city: 'San Diego', lat: 32.775, lng: -117.071, tz: 'PT' },
  { sportIds: [5], keys: ['san jose state spartans', 'san jose state'], venueName: 'Provident Credit Union Event Center', city: 'San Jose', lat: 37.335, lng: -121.881, tz: 'PT' },
  { sportIds: [5], keys: ['unlv rebels', 'unlv'], venueName: 'Thomas & Mack Center', city: 'Las Vegas', lat: 36.103, lng: -115.144, tz: 'PT' },
  { sportIds: [5], keys: ['utah state aggies', 'utah state'], venueName: 'Dee Glen Smith Spectrum', city: 'Logan', lat: 41.745, lng: -111.809, tz: 'MT' },
  { sportIds: [5], keys: ['wyoming cowboys', 'wyoming'], venueName: 'Arena-Auditorium', city: 'Laramie', lat: 41.311, lng: -105.571, tz: 'MT' },
  { sportIds: [5], keys: ['charlotte 49ers', 'charlotte'], venueName: 'Dale F. Halton Arena', city: 'Charlotte', lat: 35.307, lng: -80.735, tz: 'ET' },
  { sportIds: [5], keys: ['east carolina pirates', 'east carolina'], venueName: 'Minges Coliseum', city: 'Greenville', lat: 35.606, lng: -77.366, tz: 'ET' },
  { sportIds: [5], keys: ['florida atlantic owls', 'florida atlantic', 'fau owls'], venueName: 'Eleanor R. Baldwin Arena', city: 'Boca Raton', lat: 26.368, lng: -80.102, tz: 'ET' },
  { sportIds: [5], keys: ['memphis tigers', 'memphis'], venueName: 'FedExForum', city: 'Memphis', lat: 35.138, lng: -90.051, tz: 'CT' },
  { sportIds: [5], keys: ['north texas mean green', 'north texas'], venueName: 'The Super Pit', city: 'Denton', lat: 33.209, lng: -97.156, tz: 'CT' },
  { sportIds: [5], keys: ['rice owls', 'rice'], venueName: 'Tudor Fieldhouse', city: 'Houston', lat: 29.717, lng: -95.402, tz: 'CT' },
  { sportIds: [5], keys: ['south florida bulls', 'south florida', 'usf bulls'], venueName: 'Yuengling Center', city: 'Tampa', lat: 28.059, lng: -82.406, tz: 'ET' },
  { sportIds: [5], keys: ['temple owls', 'temple'], venueName: 'Liacouras Center', city: 'Philadelphia', lat: 39.981, lng: -75.156, tz: 'ET' },
  { sportIds: [5], keys: ['tulane green wave', 'tulane'], venueName: 'Devlin Fieldhouse', city: 'New Orleans', lat: 29.944, lng: -90.120, tz: 'CT' },
  { sportIds: [5], keys: ['tulsa golden hurricane', 'tulsa'], venueName: 'Reynolds Center', city: 'Tulsa', lat: 36.152, lng: -95.946, tz: 'CT' },
  { sportIds: [5], keys: ['uab blazers', 'uab'], venueName: 'Bartow Arena', city: 'Birmingham', lat: 33.502, lng: -86.809, tz: 'CT' },
  { sportIds: [5], keys: ['utsa roadrunners', 'utsa'], venueName: 'Convocation Center', city: 'San Antonio', lat: 29.583, lng: -98.619, tz: 'CT' },
  { sportIds: [5], keys: ['wichita state shockers', 'wichita state'], venueName: 'Charles Koch Arena', city: 'Wichita', lat: 37.720, lng: -97.294, tz: 'CT' },
  { sportIds: [5], keys: ['davidson wildcats', 'davidson'], venueName: 'John M. Belk Arena', city: 'Davidson', lat: 35.499, lng: -80.843, tz: 'ET' },
  { sportIds: [5], keys: ['dayton flyers', 'dayton'], venueName: 'UD Arena', city: 'Dayton', lat: 39.735, lng: -84.198, tz: 'ET' },
  { sportIds: [5], keys: ['duquesne dukes', 'duquesne'], venueName: 'UPMC Cooper Fieldhouse', city: 'Pittsburgh', lat: 40.437, lng: -79.990, tz: 'ET' },
  { sportIds: [5], keys: ['fordham rams', 'fordham'], venueName: 'Rose Hill Gymnasium', city: 'Bronx', lat: 40.861, lng: -73.885, tz: 'ET' },
  { sportIds: [5], keys: ['george mason patriots', 'george mason'], venueName: 'EagleBank Arena', city: 'Fairfax', lat: 38.826, lng: -77.310, tz: 'ET' },
  { sportIds: [5], keys: ['george washington revolutionaries', 'george washington'], venueName: 'Charles E. Smith Center', city: 'Washington', lat: 38.900, lng: -77.046, tz: 'ET' },
  { sportIds: [5], keys: ['la salle explorers', 'la salle'], venueName: 'John Glaser Arena', city: 'Philadelphia', lat: 40.037, lng: -75.153, tz: 'ET' },
  { sportIds: [5], keys: ['loyola chicago ramblers', 'loyola chicago', 'loyola ramblers'], venueName: 'Joseph J. Gentile Arena', city: 'Chicago', lat: 42.001, lng: -87.659, tz: 'CT' },
  { sportIds: [5], keys: ['rhode island rams', 'rhode island'], venueName: 'Ryan Center', city: 'Kingston', lat: 41.481, lng: -71.535, tz: 'ET' },
  { sportIds: [5], keys: ['richmond spiders', 'richmond'], venueName: 'Robins Center', city: 'Richmond', lat: 37.578, lng: -77.538, tz: 'ET' },
  { sportIds: [5], keys: ['saint bonaventure bonnies', 'st bonaventure bonnies', 'saint bonaventure'], venueName: 'Reilly Center', city: 'St. Bonaventure', lat: 42.080, lng: -78.484, tz: 'ET' },
  { sportIds: [5], keys: ['saint joseph s hawks', 'saint joseph\'s hawks'], venueName: 'Hagan Arena', city: 'Philadelphia', lat: 39.995, lng: -75.239, tz: 'ET' },
  { sportIds: [5], keys: ['saint louis billikens', 'saint louis', 'st louis billikens'], venueName: 'Chaifetz Arena', city: 'St. Louis', lat: 38.636, lng: -90.234, tz: 'CT' },
  { sportIds: [5], keys: ['vcu rams', 'virginia commonwealth rams', 'vcu'], venueName: 'Siegel Center', city: 'Richmond', lat: 37.551, lng: -77.453, tz: 'ET' },
  { sportIds: [5], keys: ['belmont bruins', 'belmont'], venueName: 'Curb Event Center', city: 'Nashville', lat: 36.136, lng: -86.795, tz: 'CT' },
  { sportIds: [5], keys: ['bradley braves', 'bradley'], venueName: 'Carver Arena', city: 'Peoria', lat: 40.698, lng: -89.616, tz: 'CT' },
  { sportIds: [5], keys: ['drake bulldogs', 'drake'], venueName: 'Knapp Center', city: 'Des Moines', lat: 41.605, lng: -93.653, tz: 'CT' },
  { sportIds: [5], keys: ['evansville purple aces', 'evansville'], venueName: 'Ford Center', city: 'Evansville', lat: 37.975, lng: -87.571, tz: 'CT' },
  { sportIds: [5], keys: ['illinois state redbirds', 'illinois state'], venueName: 'Redbird Arena', city: 'Normal', lat: 40.511, lng: -88.993, tz: 'CT' },
  { sportIds: [5], keys: ['indiana state sycamores', 'indiana state'], venueName: 'Hulman Center', city: 'Terre Haute', lat: 39.469, lng: -87.411, tz: 'ET' },
  { sportIds: [5], keys: ['murray state racers', 'murray state'], venueName: 'CFSB Center', city: 'Murray', lat: 36.611, lng: -88.321, tz: 'CT' },
  { sportIds: [5], keys: ['northern iowa panthers', 'northern iowa'], venueName: 'McLeod Center', city: 'Cedar Falls', lat: 42.515, lng: -92.465, tz: 'CT' },
  { sportIds: [5], keys: ['southern illinois salukis', 'southern illinois'], venueName: 'Banterra Center', city: 'Carbondale', lat: 37.714, lng: -89.221, tz: 'CT' },
  { sportIds: [5], keys: ['uic flames', 'uic'], venueName: 'Credit Union 1 Arena', city: 'Chicago', lat: 41.872, lng: -87.650, tz: 'CT' },
  { sportIds: [5], keys: ['valparaiso beacons', 'valparaiso'], venueName: 'Athletics-Recreation Center', city: 'Valparaiso', lat: 41.464, lng: -87.041, tz: 'CT' },
]

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatCrossTzTravelNote(fromTz: UsTzBucket, toTz: UsTzBucket): string | null {
  if (fromTz === toTz) return null
  const from = TZ_ORDER[fromTz]
  const to = TZ_ORDER[toTz]
  if (from < to) return 'East to West'
  if (from > to) return 'West to East'
  return 'cross-time-zone'
}

export function lookupSportsVenue(sportId: number, teamName: string): SportsVenueRow | null {
  const token = norm(teamName)
  if (!token) return null
  const last = token.split(' ').pop() || ''
  for (const row of SPORTS_VENUES) {
    if (!row.sportIds.includes(sportId)) continue
    for (const key of row.keys) {
      const k = norm(key)
      if (token === k || token.includes(k) || k.includes(token) || last === k) {
        return row
      }
    }
  }
  return null
}

function locationMatchesVenueRow(row: SportsVenueRow, loc: string, cityToken: string): boolean {
  const city = norm(row.city)
  const venueName = norm(row.venueName)
  if (city && (cityToken === city || loc.includes(city) || city.includes(cityToken))) return true
  if (venueName && (cityToken === venueName || loc.includes(venueName) || venueName.includes(cityToken))) return true
  for (const key of row.keys) {
    const k = norm(key)
    if (k && (cityToken === k || loc.includes(k) || k.includes(cityToken))) return true
  }
  for (const hint of row.locationHints || []) {
    const h = norm(hint)
    if (h && (cityToken === h || loc.includes(h) || h.includes(cityToken))) return true
  }
  return false
}

/** Match Rundown `venue_location` / `venue_name` (e.g. "Melbourne" or "Marvel Stadium") to a seeded row. */
export function lookupVenueByLocation(sportId: number, location: string): SportsVenueRow | null {
  const loc = norm(location)
  if (!loc) return null
  const cityToken = loc.split(',')[0]?.trim() || loc

  for (const row of SPORTS_VENUES) {
    if (!row.sportIds.includes(sportId)) continue
    if (locationMatchesVenueRow(row, loc, cityToken)) return row
  }
  return null
}

export type GameVenueCoords = {
  lat: number
  lng: number
  tz: UsTzBucket
  city: string
  venueName: string
}

function venueRowToCoords(row: SportsVenueRow): GameVenueCoords {
  return {
    lat: row.lat,
    lng: row.lng,
    tz: row.tz,
    city: row.city,
    venueName: row.venueName,
  }
}

/** Where a team plays for a given game (home arena or opponent home when away). */
export function resolveGameVenueCoords(
  sportId: number,
  teamName: string,
  isHome: boolean,
  opponentName: string,
  venueLocation?: string,
  venueName?: string,
): GameVenueCoords | null {
  const venueStr = String(venueLocation || '').trim()
  const venueNameStr = String(venueName || '').trim()
  if (venueStr) {
    const byLoc = lookupVenueByLocation(sportId, venueStr)
    if (byLoc) return venueRowToCoords(byLoc)
  }
  if (venueNameStr) {
    const byName = lookupVenueByLocation(sportId, venueNameStr)
    if (byName) return venueRowToCoords(byName)
  }
  if (venueStr || venueNameStr) {
    // Rundown named a site we do not have coords for. Do not stamp the listed home house.
    return null
  }
  const homeTeamName = isHome ? teamName : opponentName
  const row = lookupSportsVenue(sportId, homeTeamName)
  if (!row) return null
  return venueRowToCoords(row)
}

export const TRAVEL_MILES_THRESHOLD = 800

export function detectTravelFatigue(
  last: GameVenueCoords | null,
  current: GameVenueCoords | null,
): { travelFatigue: boolean; miles?: number; tzNote?: string } {
  if (!last || !current) return { travelFatigue: false }
  const miles = Math.round(haversineMiles(last.lat, last.lng, current.lat, current.lng))
  const tzNote = formatCrossTzTravelNote(last.tz, current.tz)
  const travelFatigue = miles >= TRAVEL_MILES_THRESHOLD || Boolean(tzNote)
  return {
    travelFatigue,
    miles: miles >= TRAVEL_MILES_THRESHOLD ? miles : undefined,
    tzNote: tzNote ?? undefined,
  }
}
