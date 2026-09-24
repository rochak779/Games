// Dialogue bank for Guess the Dialogue. Lines are paraphrased from memory,
// not quoted, so they evoke the scene without reproducing the script.
//
// A word prefixed with * is a giveaway (a name, the title, the catchphrase):
// it stays hidden until every other word is out. Tokens with no letters
// (…, —) are always shown.
//
// Order matters: puzzle #1 is the first entry, then one per day, looping.
// Eras are mixed on purpose so no week is all-80s or all-2010s.

export type Dialogue = {
  line: string;
  movie: string; // must match an entry in TITLES exactly
  year: number;
  actor: string;
};

export const DIALOGUES: Dialogue[] = [
  { line: 'Arre o *Sambha… zara bata, kitne aadmi aaye the wahan?', movie: 'Sholay', year: 1975, actor: 'Amjad Khan' },
  { line: 'Jaa *Simran jaa… apni zindagi jee le, beti.', movie: 'Dilwale Dulhania Le Jayenge', year: 1995, actor: 'Amrish Puri' },
  { line: 'Dil bada darpok hai, use bahla ke bolo — *all *is *well.', movie: '3 Idiots', year: 2009, actor: 'Aamir Khan' },
  { line: 'Waah! Bahut badhiya… aaj *Mogambo khush hua!', movie: 'Mr. India', year: 1987, actor: 'Amrish Puri' },
  { line: 'Baap ka, dada ka, bhai ka… sabka badla lega tera *Faizal.', movie: 'Gangs of Wasseypur', year: 2012, actor: 'Nawazuddin Siddiqui' },
  { line: 'Tumhare paas bangla hai, gaadi hai, daulat hai… aur mere paas *maa hai.', movie: 'Deewaar', year: 1975, actor: 'Shashi Kapoor' },
  { line: 'Main toh khud ki sabse badi fan hoon… main apni *favourite hoon!', movie: 'Jab We Met', year: 2007, actor: 'Kareena Kapoor' },
  { line: '*Babumoshai, zindagi lambi nahi… badi honi chahiye.', movie: 'Anand', year: 1971, actor: 'Rajesh Khanna' },
  { line: 'Thappad se darr nahi lagta *sahab… darr toh *pyaar se lagta hai.', movie: 'Dabangg', year: 2010, actor: 'Sonakshi Sinha' },
  { line: 'Kuch jeetne ke liye kabhi kuch haarna padta hai… aur haar ke jeetne wale ko *baazigar kehte hain.', movie: 'Baazigar', year: 1993, actor: 'Shah Rukh Khan' },
  { line: '*Salim ka pyaar tumhe marne nahi dega, *Anarkali… aur hum tumhe jeene nahi denge.', movie: 'Mughal-e-Azam', year: 1960, actor: 'Prithviraj Kapoor' },
  { line: 'Kya haal hai jawano? How\'s the *josh?! … High, sir!', movie: 'Uri: The Surgical Strike', year: 2019, actor: 'Vicky Kaushal' },
  { line: 'Rishte mein toh hum tumhare baap lagte hain… naam hai *Shahenshah.', movie: 'Shahenshah', year: 1988, actor: 'Amitabh Bachchan' },
  { line: 'Haso, jiyo, muskurao… kya pata *kal *ho *na *ho.', movie: 'Kal Ho Naa Ho', year: 2003, actor: 'Shah Rukh Khan' },
  { line: 'Bol… Mumbai ka king kaun? *Bhiku *Mhatre!', movie: 'Satya', year: 1998, actor: 'Manoj Bajpayee' },
  { line: 'Mhaari chhoriyaan chhoron se kam hain ke?', movie: 'Dangal', year: 2016, actor: 'Aamir Khan' },
  { line: 'Yeh *thana hai, tumhare baap ka ghar nahi. Jab tak kaha na jaaye, khade raho.', movie: 'Zanjeer', year: 1973, actor: 'Amitabh Bachchan' },
  { line: '*Sattar minute hain tumhare paas… shayad zindagi ke sabse khaas *sattar minute.', movie: 'Chak De! India', year: 2007, actor: 'Shah Rukh Khan' },
  { line: 'Utha le re baba… mereko nahi, in dono ko utha le!', movie: 'Hera Pheri', year: 2000, actor: 'Paresh Rawal' },
  { line: 'Aapke paaon bahut haseen hain… inhe zameen par mat utariyega, maile ho jaayenge.', movie: 'Pakeezah', year: 1972, actor: 'Raaj Kumar' },
  { line: 'Sab dekhenge ek din… *apna *time *aayega!', movie: 'Gully Boy', year: 2019, actor: 'Ranveer Singh' },
  { line: 'Hum ek baar jeete hain, ek baar marte hain, shaadi bhi ek baar… aur *pyaar bhi ek hi baar hota hai.', movie: 'Kuch Kuch Hota Hai', year: 1998, actor: 'Shah Rukh Khan' },
  { line: 'Hum jahan khade ho jaate hain… *line wahin se shuru hoti hai.', movie: 'Kaalia', year: 1981, actor: 'Amitabh Bachchan' },
  { line: 'Gussa mat kar, saans le… *control *Uday, *control!', movie: 'Welcome', year: 2007, actor: 'Nana Patekar' },
  { line: 'Yeh dhai kilo ka haath jab kisi pe padta hai na… aadmi uthta nahi, uth jaata hai.', movie: 'Damini', year: 1993, actor: 'Sunny Deol' },
  { line: 'Kisi cheez ko sachche dil se chaho, toh poori *kaynaat use tumse milane mein lag jaati hai.', movie: 'Om Shanti Om', year: 2007, actor: 'Shah Rukh Khan' },
  { line: '*Chinoy *Seth, jinke ghar sheeshe ke hon… woh doosron pe patthar nahi phenka karte.', movie: 'Waqt', year: 1965, actor: 'Raaj Kumar' },
  { line: 'Tension kaiko leta hai, *mamu? Ek *jaadu *ki *jhappi de de.', movie: 'Munna Bhai M.B.B.S.', year: 2003, actor: 'Sanjay Dutt' },
  { line: 'Poora naam *Vijay *Dinanath *Chauhan… baap ka naam Dinanath, gaon *Mandwa.', movie: 'Agneepath', year: 1990, actor: 'Amitabh Bachchan' },
  { line: 'Aam aadmi ko halke mein mat lena… don\'t underestimate the power of a *common *man.', movie: 'Chennai Express', year: 2013, actor: 'Shah Rukh Khan' },
  { line: 'I can talk English, I can walk English… because English is a very *phunny language.', movie: 'Namak Halaal', year: 1982, actor: 'Amitabh Bachchan' },
  { line: 'Koi bhi desh perfect paida nahi hota… use perfect banana padta hai.', movie: 'Rang De Basanti', year: 2006, actor: 'Aamir Khan' },
  { line: '*Dosti ka ek usool hai, madam… no sorry, no thank you.', movie: 'Maine Pyar Kiya', year: 1989, actor: 'Salman Khan' },
  { line: '*Babuji ne kaha ghar chhodo, *Paro ne kaha sharaab chhodo… ek din sab kahenge duniya hi chhod do.', movie: 'Devdas', year: 2002, actor: 'Shah Rukh Khan' },
  { line: 'Gyarah mulkon ki police peeche hai… par *Don ko pakadna mushkil nahi, namumkin hai.', movie: 'Don', year: 1978, actor: 'Amitabh Bachchan' },
  { line: '*Hindustan zindabad tha, zindabad hai… aur zindabad rahega!', movie: 'Gadar: Ek Prem Katha', year: 2001, actor: 'Sunny Deol' },
  { line: 'Naam hai mera *Crime *Master *Gogo… aankhein nikaal ke gotiyaan khelta hoon.', movie: 'Andaz Apna Apna', year: 1994, actor: 'Shakti Kapoor' },
  { line: '*Parampara, *pratishtha, *anushasan… yeh is *Gurukul ke teen stambh hain.', movie: 'Mohabbatein', year: 2000, actor: 'Amitabh Bachchan' },
  { line: 'Main logon ke dil mein aata hoon… samajh mein nahi.', movie: 'Kick', year: 2014, actor: 'Salman Khan' },
  { line: 'Mere *Karan *Arjun aayenge… zameen ka seena phaad ke aayenge.', movie: 'Karan Arjun', year: 1995, actor: 'Raakhee' },
  { line: 'Tum haan karo ya na karo… I love you, *K-k-k-Kiran.', movie: 'Darr', year: 1993, actor: 'Shah Rukh Khan' },
  { line: '*Rahul… naam toh suna hi hoga.', movie: 'Dil To Pagal Hai', year: 1997, actor: 'Shah Rukh Khan' },
  { line: 'Jeet gaye toh teen saal ki chhoot… haar gaye toh *tigna *lagaan bharna padega.', movie: 'Lagaan', year: 2001, actor: 'Paul Blackthorne' },
  { line: '*Balwant *Rai ke kutton… ab tumhara hisaab hoga!', movie: 'Ghayal', year: 1990, actor: 'Sunny Deol' },
  { line: 'Bhagwan se baat karne ka yeh number… *wrong *number lag gaya hai!', movie: 'PK', year: 2014, actor: 'Aamir Khan' },
  { line: 'Maine ek baar keh diya… toh bas keh diya.', movie: 'Kabhi Khushi Kabhie Gham', year: 2001, actor: 'Amitabh Bachchan' },
  { line: 'Ek baar maine *commitment kar di, uske baad toh main khud ki bhi nahi sunta.', movie: 'Wanted', year: 2009, actor: 'Salman Khan' },
  { line: 'Dil mein apni betaabiyan le kar chal rahe ho… toh *zinda ho tum.', movie: 'Zindagi Na Milegi Dobara', year: 2011, actor: 'Farhan Akhtar' },
  { line: 'Tu fikar kyun karta hai, yaar… *main *hoon *na.', movie: 'Main Hoon Na', year: 2004, actor: 'Shah Rukh Khan' },
  { line: 'Na talwar ki dhaar se, na goliyon ki bauchhaar se… banda darta hai toh sirf *parvardigar se.', movie: 'Tirangaa', year: 1993, actor: 'Raaj Kumar' },
  { line: 'Main udna chahta hoon, daudna chahta hoon, girna bhi… bas *rukna nahi chahta.', movie: 'Yeh Jawaani Hai Deewani', year: 2013, actor: 'Ranbir Kapoor' },
  { line: '*Do *October ko hum sab *satsang gaye the… aur agle din picture dekhne.', movie: 'Drishyam', year: 2015, actor: 'Ajay Devgn' },
  { line: 'Mera naam *Khan hai… aur main terrorist nahi hoon.', movie: 'My Name Is Khan', year: 2010, actor: 'Shah Rukh Khan' },
  { line: 'Bahut ho gaya, bas… ab *aata *majhi *satakli!', movie: 'Singham', year: 2011, actor: 'Ajay Devgn' },
  { line: 'Jo main bolta hoon woh karta hoon… aur jo nahi bolta, woh toh *definitely karta hoon.', movie: 'Rowdy Rathore', year: 2012, actor: 'Akshay Kumar' },
  { line: '*Jaadu ko *dhoop chahiye… *dhoop, *dhoop!', movie: 'Koi… Mil Gaya', year: 2003, actor: 'Hrithik Roshan' },
  { line: '*Na sirf ek shabd nahi, apne aap mein poora vaakya hai… *no *means *no.', movie: 'Pink', year: 2016, actor: 'Amitabh Bachchan' },
  { line: '*Bajirao ne *Mastani se mohabbat ki hai… ayyashi nahi.', movie: 'Bajirao Mastani', year: 2015, actor: 'Ranveer Singh' },
  { line: 'Bete ko haath lagane se pehle… *baap se baat kar.', movie: 'Jawan', year: 2023, actor: 'Shah Rukh Khan' },
  { line: 'Mission poora hoga, chinta mat karo… *yeh *dil *maange *more!', movie: 'Shershaah', year: 2021, actor: 'Sidharth Malhotra' },
];

// Short forms people actually type.
export const ALIASES: Record<string, string[]> = {
  'Dilwale Dulhania Le Jayenge': ['ddlj'],
  'Kabhi Khushi Kabhie Gham': ['k3g', 'kabhi khushi kabhi gham'],
  'Kuch Kuch Hota Hai': ['kkhh'],
  'Kal Ho Naa Ho': ['khnh', 'kal ho na ho'],
  'Zindagi Na Milegi Dobara': ['znmd'],
  'Yeh Jawaani Hai Deewani': ['yjhd', 'yeh jawani hai deewani'],
  'Om Shanti Om': ['oso'],
  'My Name Is Khan': ['mnik'],
  'Rang De Basanti': ['rdb'],
  'Gangs of Wasseypur': ['gow'],
  'Munna Bhai M.B.B.S.': ['munna bhai mbbs'],
  'Lage Raho Munna Bhai': ['lrmb'],
  'Hum Aapke Hain Koun..!': ['hahk'],
  'Hum Dil De Chuke Sanam': ['hddcs'],
  'Andaz Apna Apna': ['aaa', 'andaaz apna apna'],
  'Uri: The Surgical Strike': ['uri'],
  'Gadar: Ek Prem Katha': ['gadar'],
  'Mughal-e-Azam': ['mughal e azam'],
  'Koi… Mil Gaya': ['koi mil gaya'],
  'Dil To Pagal Hai': ['dtph', 'dil toh pagal hai'],
};

// Everything the autocomplete offers: every answer plus plenty of decoys.
const DECOYS = [
  'Amar Akbar Anthony', 'Trishul', 'Silsila', 'Kabhi Kabhie', 'Muqaddar Ka Sikandar', 'Coolie', 'Laawaris',
  'Mard', 'Sharaabi', 'Chupke Chupke', 'Guide', 'Aradhana', 'Amar Prem', 'Kati Patang', 'Bobby',
  'Roti Kapda Aur Makaan', 'Upkar', 'Shree 420', 'Awaara', 'Mera Naam Joker', 'Pyaasa', 'Kaagaz Ke Phool',
  'Mother India', 'Jewel Thief', 'Teesri Manzil', 'Padosan', 'Seeta Aur Geeta', 'Satte Pe Satta', 'Qurbani',
  'Karz', 'Hero', 'Ram Lakhan', 'Tezaab', 'Chaalbaaz', 'Chandni', 'Karma', 'Tridev', 'Parinda',
  'Qayamat Se Qayamat Tak', 'Dil', 'Saajan', 'Sadak', 'Aashiqui', 'Hum', 'Khuda Gawah', 'Beta', 'Deewana',
  'Khiladi', 'Jo Jeeta Wohi Sikandar', 'Roja', 'Bombay', 'Dil Se..', 'Hum Aapke Hain Koun..!', 'Rangeela',
  'Raja Hindustani', 'Border', 'Pardes', 'Ishq', 'Judwaa', 'Hero No. 1', 'Coolie No. 1',
  'Bade Miyan Chote Miyan', 'Soldier', 'Ghulam', 'Hum Dil De Chuke Sanam', 'Sarfarosh', 'Taal', 'Vaastav',
  'Kaho Naa… Pyaar Hai', 'Mission Kashmir', 'Dhadkan', 'Refugee', 'Dil Chahta Hai', 'Company', 'Saathiya',
  'Baghban', 'Swades', 'Veer-Zaara', 'Dhoom', 'Black', 'Bunty Aur Babli', 'Sarkar', 'Lage Raho Munna Bhai',
  'Krrish', 'Omkara', 'Dhoom 2', 'Don 2', 'Golmaal', 'Kabhi Alvida Naa Kehna', 'Taare Zameen Par',
  'Bhool Bhulaiyaa', 'Jodhaa Akbar', 'Rock On!!', 'Ghajini', 'Rab Ne Bana Di Jodi', 'Dostana', 'Love Aaj Kal',
  'Wake Up Sid', 'Band Baaja Baaraat', 'Golmaal 3', 'Once Upon a Time in Mumbaai', 'Delhi Belly', 'Bodyguard',
  'Rockstar', 'The Dirty Picture', 'Kahaani', 'Paan Singh Tomar', 'Barfi!', 'Ek Tha Tiger', 'Vicky Donor',
  'Special 26', 'Bhaag Milkha Bhaag', 'Queen', 'Haider', 'Piku', 'Bajrangi Bhaijaan', 'Tanu Weds Manu',
  'Sultan', 'Neerja', 'Andhadhun', 'Stree', 'Badhaai Ho', 'Padmaavat', 'Sanju', 'Kabir Singh', 'Article 15',
  'Tanhaji', 'Sooryavanshi', 'Pathaan', 'Animal', '12th Fail', 'Rocky Aur Rani Kii Prem Kahaani',
  'Laapataa Ladies', 'Stree 2', 'Brahmastra', 'Gangubai Kathiawadi', 'Phir Hera Pheri', 'Dhamaal', 'Housefull',
  'Phir Bhi Dil Hai Hindustani', 'Josh', 'Mohra', 'Anjaam', 'Chalti Ka Naam Gaadi', 'Abhimaan', 'Namak Haraam',
  'Baton Baton Mein', 'Masoom', 'Mr. Natwarlal', 'Shaan', 'Shakti', 'Gangs of Wasseypur 2', 'Singham Returns',
  'Dabangg 2', 'Munna Bhai Chale Amerika', 'Kranti', 'Nagina', 'Tohfa', 'Himmatwala', 'Sangam', 'Junglee',
  'Kashmir Ki Kali', 'Bawarchi', 'Golmaal (1979)', 'Angoor', 'Jaane Bhi Do Yaaro', 'Arth', 'Ijaazat',
  'Main Tulsi Tere Aangan Ki', 'Veer', 'Race', 'Jab Tak Hai Jaan', 'Barsaat', 'Krrish 3', 'War', 'Tiger 3',
  'Ae Dil Hai Mushkil', 'Dilwale', 'Happy New Year', 'Raees', 'Fan', 'Dunki', 'Dear Zindagi', 'Tamasha',
  'Wake Up Sid', 'Udaan', 'Masaan', 'Talvar', 'Raazi', 'Kesari', 'Mission Mangal', 'Toilet: Ek Prem Katha',
  'Airlift', 'Baby', 'Rustom', 'Holiday', 'OMG – Oh My God!', 'Bhaag Milkha Bhaag',
];

export const TITLES: string[] = [...new Set([...DIALOGUES.map((d) => d.movie), ...DECOYS])].sort((a, b) =>
  a.localeCompare(b),
);
