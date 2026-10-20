-- Backfill post times for the 2026-10-20 regression seed (apply after 20261020100000).
update public.fantasy_insider_regression r set posted_at = v.posted_at
from (values
  ('ben_baby', 'Bengals officially place TE Tanner Hudson on injured reserve. Expected to miss the rest of the season with a torn pectoral.', '2026-10-19T14:24:40.000Z'::timestamptz),
  ('ben_baby', 'Can confirm that Bengals TE Tanner Hudson suffered a torn pec and will likely be out for the season, his agent tells ESPN.

Hudson has been a big receiving option for Joe Burrow and had a TD in Sunday’s win against Miami.

First reported by @char_cliff.', '2026-10-13T15:49:38.000Z'::timestamptz),
  ('ben_baby', 'Bengals LB Swayze Bozeman will go on IR with a broken forearm.

TE Tanner Hudson dealing with a pectoral injury that could potentially place him on IR.', '2026-10-12T19:00:36.000Z'::timestamptz),
  ('ben_baby', 'Bengals will not have WR Colbie Young today. He is inactive.

Full list of inactives: S Kyle Dugger, C Connor Lew, OT Myles Hinton, TE Jack Endries, WR Colbie Young, DT Landon Robinson.', '2026-10-11T15:30:49.000Z'::timestamptz),
  ('ben_baby', 'The Bengals called up no wide receivers from the practice squad with WRs Ja’Marr Chase, Tee Higgins and Colbie Young listed as questionable. 

S Russ Yeast is the only elevation for Sunday’s game vs. MIA.', '2026-10-10T20:03:03.000Z'::timestamptz),
  ('ben_baby', 'Bengals WRs Ja''Marr Chase and Tee Higgins were both full participants for today''s practice. 

Both officially listed as questionable.', '2026-10-09T20:14:35.000Z'::timestamptz),
  ('ben_baby', 'Latest on Ja''Marr Chase and Tee Higgins from coach Zac Taylor. 

Chase still in concussion protocol. On Higgins: "We''ll see." https://t.co/gzox8jYWaC', '2026-10-09T16:19:07.000Z'::timestamptz),
  ('ben_baby', 'Bengals WR Ja’Marr Chase and WR Tee Higgins both ran routes and caught passes during the portion of practice open to the media.', '2026-10-09T15:32:52.000Z'::timestamptz),
  ('ben_baby', 'Bengals WR Ja''Marr Chase officially limited in his first practice back. Remains in concussion protocol but was a DNP yestersday. 

WR Tee Higgins (groin/neck) was a DNP but got in work on the team''s rehab field today. 

WR Colbie Young (knee) upgraded to a full participant.', '2026-10-08T20:18:04.000Z'::timestamptz),
  ('ben_baby', 'Bengals WR Tee Higgins is currently working on the rehab field. https://t.co/DVVzjdYlzm', '2026-10-08T17:43:21.000Z'::timestamptz),
  ('ben_baby', 'Bengals WR Ja’Marr Chase is back at practice. Been in concussion protocol. https://t.co/hZQvDyxTu7', '2026-10-08T17:36:17.000Z'::timestamptz),
  ('bradyhenderson', 'Macdonald on Zach Charbonnet: “Zach is going to have a full week’s worth of reps … There’s a possibility that you could see him on Sunday in some capacity, so that’s exciting.” https://t.co/hIQdqnfiW4', '2026-10-19T23:42:01.000Z'::timestamptz),
  ('bradyhenderson', 'Macdonald confirmed what @JFowlerESPN reported, saying Elijah Arroyo will miss "a significant amount of time" with a shoulder injury. He implied Arroyo will likely go on IR: "How long that is, I’m not sure. There’s some options on the table that I think are just about finalized."', '2026-10-19T23:27:38.000Z'::timestamptz),
  ('bradyhenderson', 'The Seahawks announces these moves to their practice squad: 

-TE Josiah Deguara and FB Jackson Acker signed
-RB Dontae McMillan and WR Malick Meiga released', '2026-10-19T18:26:06.000Z'::timestamptz),
  ('bradyhenderson', 'This comes after Elijah Arroyo left the Thursday night game with a shoulder injury. https://t.co/2He0R3M6a7', '2026-10-19T16:40:19.000Z'::timestamptz),
  ('bradyhenderson', '“We trust Sam, we believe in him, and we definitely feel like he''s part of the solution in terms of us playing better football on offense.”

More on Mike Macdonald sticking with Sam Darnold despite seven interceptions in four games: https://t.co/vMM4MV6PGP', '2026-10-16T19:40:05.000Z'::timestamptz),
  ('bradyhenderson', 'Macdonald said there was no update on RB Zach Charbonnet. Seattle needs to activate him off PUP by Thursday (though they don''t necessarily have to play him against Kansas City on Sunday night).', '2026-10-16T16:59:05.000Z'::timestamptz),
  ('bradyhenderson', 'Injury notes from Macdonald:

-On RG Anthony Bradford: "Really good chance of him practicing this week and playing."

-On RB Jadarian Price, who has to miss at least one more game while on IR: "We should be looking at a sooner-rather-than-later return after this (upcoming) game."', '2026-10-16T16:58:21.000Z'::timestamptz),
  ('bradyhenderson', 'Seahawks coach Mike Macdonald, when asked by @TheMikeSalk on @SeattleSports if he''s at all considering a change at QB: "No. No." 

He said he knows they have a starting-caliber backup in Drew Lock but that he believes they can find solutions with Sam Darnold as their starter.', '2026-10-16T16:44:26.000Z'::timestamptz),
  ('courtneyrcronin', 'Bears estimated injury report lists Jonah Jackson (hip/quad) as DNP. 

T.J. Edwards and Kyle Monangai are still DNP. Jack Sanborn has a concussion. Tyrique Stevenson and Keyshaun Elliott upgraded to full. https://t.co/RJzDbJ3MVs', '2026-10-19T23:59:44.000Z'::timestamptz),
  ('courtneyrcronin', 'Nearing his return from a hamstring injury, Caleb Williams let Ben Johnson know his goals for the Bears offense against the Falcons.

"I walked in his office, dapped him up and said, ''Let''s get this thing going this week," Williams said. "I walked out after that."

Williams'' return under center sparked the Bears offense in ways it hadn''t seen since the season opener in Carolina. 
https://t.co/OXPQFCmCZg', '2026-10-19T00:54:55.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams is unsure whether he''s playing against Atlanta but detailed the significant strides he''s made in his recovery from a "pretty serious" hamstring tear that sidelined him for the Bears last 3 games.

https://t.co/qlX8lm4O2t', '2026-10-15T22:38:04.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams on trusting his hamstring when he''s back on the field: "I trust myself. I trust my body. I trust my guys. And so, if I’m out there, I’m out there and it’s full trust. If I’m not out there, I need a little more time."', '2026-10-15T20:56:35.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams took issue with reports out there over the type/severity of his injury.  He said that nothing that was reported was accurate and clarifies that the sustained a "hamstring tear, a pretty serious one." Williams did not disclose the grade of the hamstring injury when asked.', '2026-10-15T19:59:29.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams: "Before you start asking, (I) do not know if I''m playing yet." Says he has to go through various stress testing and clear medical protocols in order for him to return. He then goes through a long list of thanks, from his teammates for carrying the load in his absence to Bears trainers and his own team for helping him get back on the field.', '2026-10-15T19:51:23.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams goes through his first full practice this week. He’s wearing a sleeve on his right leg (where he injured his hamstring), which he did not have on during Friday’s practice or at Green Bay. 

Tyson Bagent then Case Keenum took snaps behind him. https://t.co/0C7F07QH9S', '2026-10-15T19:34:32.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams was a FULL participant in his first actual practice since prior to Week 2. He had the same designation for walk thru on Wednesday.

Still no Kyle Monangai (toe/thumb), T.J. Edwards (hamstring), Dayo Odeyingbo (quad), Keyshaun Elliott (quad).

Tyrique Stevenson (hip) was limited again.', '2026-10-15T19:32:02.000Z'::timestamptz),
  ('courtneyrcronin', 'From @SportsCenter: The injury report is out after an extended walk-thru on Wednesday. QB Caleb Williams was a FULL participant while RB Kyle Monangai (toe/thumb) was DNP. https://t.co/ggUA55AXzu', '2026-10-14T22:18:08.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams will be listed as a full participant on the injury report today. The Bears are conducting a walk thru, so the injury report is an estimation. Their first real practice is tomorrow.', '2026-10-14T16:10:06.000Z'::timestamptz),
  ('courtneyrcronin', 'Ben Johnson on Caleb Williams: "He’s doing a great job progressing and we’ll see when we can make him available to help us win ball games. But he’s itching to get back as soon as he can, which is a good thing, and when we get the green light, we’ll move forward from there."', '2026-10-12T20:23:55.000Z'::timestamptz),
  ('courtneyrcronin', 'Ben Johnson said the Bears are still working through who will be their starting quarterback should Caleb Williams not be ready to come back vs. Atlanta: "No determination has been made in terms of what direction we’re going. There are a lot of things that we’re assessing right now."', '2026-10-12T20:22:33.000Z'::timestamptz),
  ('courtneyrcronin', 'Ben Johnson on whether Tyson Bagent is still QB2 if Caleb Williams can''t go this week: "We have three guys that can win games in this league."', '2026-10-12T20:20:47.000Z'::timestamptz),
  ('courtneyrcronin', 'Ben Johnson tells @JeffJoniak that Caleb Williams is "going the right way" and reiterates that he didn''t see Williams'' pregame workout at Green Bay. I imagine Johnson got some indication of how that went by now but he said very little that''s different from last night.

Johnson said it''ll be "close" as to whether Williams returns for the Atlanta game. Whether the quick turnaround after Week 6 before the Patriots come to town for TNF in Week 7 factors into the Bears decision on when to bring Williams back is something Johnson isn''t weighing yet. 

Johnson: "I am honestly not even thinking about that far. We are solely focused on today and this week."', '2026-10-12T16:35:49.000Z'::timestamptz),
  ('courtneyrcronin', 'Caleb Williams is “close” to returning after disastrous Bears loss to the Packers. But if Week 6 is too soon given Chicago’s tight turn around in Week 7, Ben Johnson has another backup decision to make. https://t.co/VFJy8WJL6k', '2026-10-12T00:58:20.000Z'::timestamptz),
  ('espndirocco', 'Per ESPN Research, Jaguars WR Brian Thomas Jr. played zero snaps in the second half after playing 15 in the first half.', '2026-10-18T16:57:30.000Z'::timestamptz),
  ('espndirocco', 'Jaguars KR Ameer Abdullah is cleared to return', '2026-10-18T14:14:42.000Z'::timestamptz),
  ('espndirocco', 'Jaguars KR/RB Ameer Abdullah is being evaluated for a concussion.', '2026-10-18T14:09:58.000Z'::timestamptz),
  ('espndirocco', 'Jaguars CB Montaric Brown and LS Ross Matiscik DNP Wednesday. Four Texans, including RB David Montgomery and LB Azeez Al-Shaair, DNP. https://t.co/n3FM5CvoUY', '2026-10-14T22:01:50.000Z'::timestamptz),
  ('espndirocco', 'Jaguars inactives vs Eagles: WR C.J. Williams, CB Alijah Huzzie, S Eric Murray, CB Jaylon Jones, OL Daniel Faalele, DE Wesley Williams, DT Albert Regis. Rayuan Lane will likely start in place of Murray (concussion).', '2026-10-11T12:04:40.000Z'::timestamptz),
  ('espndirocco', 'Jaguars list S Eric Murray (concussion) as doubtful for the Eagles on Sunday. Everyone else has no game status. RB Saquon Barkley (hamstring), WR DeVonta Smith (hamstring), WR Hollywood Brown (ankle) are out for the Eagles.', '2026-10-09T20:07:10.000Z'::timestamptz),
  ('espndirocco', 'Seven Eagles players DNP on Wednesday, including RB Saquon Barkley and WR DeVonta Smith. Jaguars S Eric Murray (concussion) only DNP for the Jaguars. https://t.co/N6HFOMWTU1', '2026-10-07T22:21:51.000Z'::timestamptz),
  ('holderstephen', 'Colts Tight end Tyler Warren is OUT with a groin injury today.', '2026-10-18T15:33:56.000Z'::timestamptz),
  ('holderstephen', 'WR Josh Downs is listed with a hamstring issue, but he did individual drills today. That one doesn’t seem serious.', '2026-10-14T20:35:04.000Z'::timestamptz),
  ('holderstephen', 'Busy injury report for the Colts. The concussion evaluation designations for DE J.T. Tuimoloau and G Matt Goncalves means they left practice to be checked. Whether they passed those evals is unclear.

QB Daniel Jones is listed w an ankle, but was a full participant. (more) https://t.co/08lGZgQl1W', '2026-10-14T20:35:03.000Z'::timestamptz),
  ('holderstephen', 'With the Colts making overtures on Cardinals WR Marvin Harrison Jr., who is expected to be traded imminently, makes you wonder about the prospect of a return anytime soon for Alec Pierce. They are still expecting him back at some point, but I have yet to hear a timeline.', '2026-10-10T16:15:32.000Z'::timestamptz),
  ('holderstephen', 'This might have been the week the Colts finally got WR Darius Slayton involved, but he sustained a knee injury in today’s practice and is now considered questionable for Sunday vs the Steelers. https://t.co/G7rnl0VTZn', '2026-10-09T19:28:23.000Z'::timestamptz),
  ('holderstephen', 'NEW: The latest on Cardinals WR Marvin Harrison Jr and the trade rumors swirling around him. Among the teams keeping an eye on his situation — the Indianapolis Colts, his HOF father’s former team. https://t.co/3pA19cayPT', '2026-10-09T00:39:06.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens coach Jesse Minter still describes QB Lamar Jackson (ankle) as "day to day."

Minter said Jackson could "potentially" practice this week.

Jackson has missed the past two games after injuring his left ankle on Oct. 4.

Ravens play host to the Bengals on Sunday.', '2026-10-19T19:48:07.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens coach Jesse Minter on WR Rashod Bateman, who didn''t return to the game Sunday with a shoulder injury: "I think he came out of it OK, even though we kind of came out of the game. But I think there''s a little bit of optimism that he should be okay."', '2026-10-19T19:45:21.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens coach Jesse Minter said there is a confidence level in kicker Tyler Loop but pointed out how Loop''s recent misses have been critical ones.

"We need to make second half kicks," Minter said. 

Minter talked about how a missed kick is no different than a turnover. He also did not shoot down the notion of possibly adding a kicker.', '2026-10-19T19:16:00.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens WR Rashod Bateman (shoulder) has been ruled out for the rest of the game.

That means it''s Zay Flowers, Ja''Kobi Lane, Devontez Walker and LaJohntay Wester at WR for Baltimore.', '2026-10-18T18:39:14.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens WR Rashod Bateman (shoulder) is questionable to return.

Bateman dealt with the shoulder injury all week. He wore a red noncontact jersey for a couple days this past week.', '2026-10-18T18:17:53.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens QB Lamar Jackson (ankle) doesn’t practice for 2nd straight day.

WR Zay Flowers (toe) was added to injury report after being limited Thursday. 

Two other starters — WR Rashod Bateman and LG John Simpson — did not practice. https://t.co/OZgbZrtIGT', '2026-10-15T20:35:00.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens QB Lamar Jackson (ankle) was one of five Ravens players not present during Thursday’s media viewing of practice.

The others:

WR Rashod Bateman (shoulder)
G John Simpson (groin)
TE Matthew Hibner (hand)
DL Broderick Washington (ankle)

C Cam Jurgens (concussion) remains in a red non-contact jersey and observed off to the side. 

If Jurgens and Simpson can’t play, Baltimore would stick with Vega Ioane at center and go with Andrew Vorhees and Emery Jones at the guard spots.', '2026-10-15T17:24:27.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens QB Lamar Jackson is not present at the start of Thursday’s practice.

Jackson is dealing with a left ankle injury that he sustained on Oct. 4.

If Jackson can’t play, it would be Tyler Huntley for a second straight game. https://t.co/Vtfp9HjOX7', '2026-10-15T17:03:06.000Z'::timestamptz),
  ('jamisonhensley', 'More on Lamar Jackson (ankle) having a realistic chance of playing Sunday (via @AdamSchefter)

https://t.co/Awrs3qu543', '2026-10-14T23:04:48.000Z'::timestamptz),
  ('jamisonhensley', 'Lamar Jackson (ankle) did not practice Wednesday and was one of 19 players listed the Ravens injury report.

The only other Ravens player who didn’t practice due to injury was tight end Matthew Hibner (hand).

OLB Trey Hendrickson (finger) had a full practice after missing the last two games.

WR Ja’Kobi Lane (wrist), who is looking to return off IR, had a full practice.

C Cam Jurgens (concussion) was limited.

This also marked the first time all season that WR Zay Flowers wasn’t listed on the injury report.', '2026-10-14T20:58:33.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens WR Rashod Bateman was limited in Wednesday’s practice. 

Bateman came out onto the practice field after media viewing ended. 

“He should be fine,” coach Jesse Minter said.', '2026-10-14T19:25:00.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens QB Lamar Jackson (ankle) is considered day to day, coach Jesse Minter said after Wednesday’s practice. 

Jackson didn’t practice Wednesday. https://t.co/kUFI4RJ0Dv', '2026-10-14T19:23:01.000Z'::timestamptz),
  ('jamisonhensley', 'Reinforcements are on their way for the Ravens. Here are three injured players returning to practice:

OLB Trey Hendrickson (finger)
WR Ja’Kobi Lane (wrist)
C Cam Jurgens (concussion)

Hendrickson is wearing a wrap on his right hand after missing last two practices.

Jurgens is wearing a non-contact jersey and has been watching off to the side.

There are four players not present during media viewing:

QB Lamar Jackson (ankle)
WR Rashod Bateman
TE Matthew Hibner (hand)
DE Calais Campbell

Campbell has been regularly received rest days on Wednesday.', '2026-10-14T17:35:30.000Z'::timestamptz),
  ('jamisonhensley', 'A look at Ravens WR Ja’Kobi Lane is in first practice back since hurting his wrist in the season opener https://t.co/idNYYp5RZI', '2026-10-14T17:27:21.000Z'::timestamptz),
  ('jamisonhensley', 'Lamar Jackson is not present at the start of media viewing of Wednesday’s Ravens practice.

Jackson missed Sunday night’s game with a sprained left ankle. https://t.co/o94On4B1BJ', '2026-10-14T17:20:53.000Z'::timestamptz),
  ('jamisonhensley', 'An enthusiastic Ja’Kobi Lane is back on the practice field, which starts window to return off IR. The rookie wide receiver injured his wrist in the season opener on Sept. 13.  https://t.co/kseail4OC2', '2026-10-14T17:15:56.000Z'::timestamptz),
  ('jamisonhensley', 'Ravens coach Jesse Minter said Lamar Jackson is "definitely doing better" with his sprained left ankle, which caused him to miss Sunday''s game.

Minter believes the team will know more about Jackson''s status by the middle of the week. He isn''t sure whether Jackson will practice Wednesday.

"He''s doing everything he can to get back out there," Minter said.', '2026-10-12T19:06:13.000Z'::timestamptz),
  ('jennalaineespn', 'Bucs quarterback Baker Mayfield is set to return to practice this week after missing three games with a dislocated thumb. Here’s what we know: https://t.co/pyutxJdaqg', '2026-10-20T00:05:28.000Z'::timestamptz),
  ('jennalaineespn', 'Coach Todd Bowles said Baker Mayfield is supposed to practice Wednesday and they’ll “take a good look at him there.” They’ll evaluate him during the week to see how he does. But…he said he believes they need to game plan as if Jalon Daniels is playing. Both players will be in prep meetings however.', '2026-10-19T16:44:22.000Z'::timestamptz),
  ('jennalaineespn', 'The Bucs have opened the 21-day practice window for wide receiver David Sills V. He can be activated off of IR at any time during this period.', '2026-10-12T19:37:35.000Z'::timestamptz),
  ('jennalaineespn', 'The Bucs have elevated safety J.J. Roberts and quarterback Easton Stick from the practice squad to the active roster for tonight’s game against the Dallas Cowboys. It’s the first elevation of the season for Roberts and the second for Stick.', '2026-10-08T20:34:04.000Z'::timestamptz),
  ('jennalaineespn', 'Chase McLaughlin was added to the injury report yesterday with a right groin/hip injury, but coach Todd Bowles said “he’ll be fine.” He also said Baker Mayfield, Antoine Winfield, Jr., Benjamin Morrison and SirVocea Dennis will be out against the Cowboys.', '2026-10-07T16:01:29.000Z'::timestamptz),
  ('jordanraanan', 'John Harbaugh says he knows and understands how Najee Harris and the RBs feel about the 4-man rotation. They all want t be the No. 1 guy. 

But Harbaugh says he also knows that carries are "earned" and tells them "do something" in their opportunities and more will come.', '2026-10-19T19:53:07.000Z'::timestamptz),
  ('jordanraanan', 'John Harbaugh says they''re "working through that now" on a quarterback decision between Jameis Winston and J.J. McCarthy. Not ready to name a starter for this week vs. Texans.', '2026-10-19T19:35:38.000Z'::timestamptz),
  ('jordanraanan', 'The Giants RB snap distribution:
Devin Singletary 29 
Tyrone Tracy Jr. 26
Najee Harris 11
Cam Skattebo 6

A little slanted because they were in comeback mode but clearly an altered rotation. Would expect Skattebo to be more in the mix next week vs. Texans.', '2026-10-19T11:23:03.000Z'::timestamptz),
  ('jordanraanan', 'John Harbaugh says now is not the time to  make a QB decision. He still believes in Jameis Winston. The quarterbacks will be judged on performance. https://t.co/p7gw9VomTB', '2026-10-18T20:49:38.000Z'::timestamptz),
  ('jordanraanan', 'John Harbaugh also hinted the Giants have more in store for the J.J. McCarthy package. We haven''t seen it all yet. https://t.co/gBwCN0s1AX', '2026-10-15T15:14:57.000Z'::timestamptz),
  ('jordanraanan', 'The J.J. McCarthy package isn''t going anywhere... 

https://t.co/cq5zIuWKGB', '2026-10-15T13:10:43.000Z'::timestamptz),
  ('jordanraanan', 'Full Giants injury report

Did Not Participate in Practice: 
OLB Abdul Carter (calf) 
RT Jermaine Eluemunor (calf) 
CB Colton Hood (concussion)
S Tyler Nubin (neck) 
LT Andrew Thomas (groin)  

Limited: 
TE Theo Johnson (neck(
WR Darnell Mooney (neck) 
CB Greg Newsome II (groin)
S Jason Pinnock (concussion)

Full: 
DB Elijah Campbell (thumb)
RB Najee Harris (ribs)
TE Isaiah Likely (foot)', '2026-10-14T20:18:38.000Z'::timestamptz),
  ('jordanraanan', 'WR Braxton Berrios had successful surgery on Friday to repair a lisfranc injury, per sources. He is out for the season and was placed on injured reserve last week. https://t.co/U1uLv1IV9M', '2026-10-14T16:54:24.000Z'::timestamptz),
  ('josephperson', 'Dave Canales on Baker Mayfield: Knowing Baker, if he has the chance to play he’s gonna play.

Said he expects to see Mayfield starting Sunday in Charlotte.', '2026-10-19T17:38:16.000Z'::timestamptz),
  ('josephperson', 'Panthers injury report:
-Monroe Freeling (knee) limited after DNP yesterday
-AJ Dillon (ankle) DNP
-Also limited: Damien Lewis (elbow), Jaelan Phillips (hamstring), Tommy Tremble (rib), Darren Waller (toe)', '2026-10-15T19:32:57.000Z'::timestamptz),
  ('josephperson', 'Tommy Tremble (ribs) back at practice. Do not AJ Dillon (ankle) with the RBs during individual drills.', '2026-10-15T18:11:26.000Z'::timestamptz),
  ('josephperson', 'Jalen Hurts out Sunday vs. the Panthers. https://t.co/5fXsvquIse', '2026-10-15T17:30:43.000Z'::timestamptz),
  ('josephperson', 'Everyone else would have been full participation (and presumably were Tuesday), including:
-Jalen Coker (quad)
-The three players whose practice windows opened this week: Taylor Moton, Turk Wharton and Trevor Etienne. https://t.co/AC3lrkFASd', '2026-10-14T20:10:42.000Z'::timestamptz),
  ('josephperson', 'Panthers injury report (a projection since they didn''t actually practice):
DNP: Monroe Freeling (knee), AJ Dillon (ankle)
Limited: Damien Lewis (elbow), Jaelan Phillips (hamstring), Tommy Tremble (ribs), Darren Waller (toe)', '2026-10-14T20:08:49.000Z'::timestamptz),
  ('josephperson', 'Dave Canales said it was cool feeling the energy from the returning players today -- Taylor Moton, Turk Wharton and Trevor Etienne.', '2026-10-13T19:41:46.000Z'::timestamptz),
  ('josephperson', 'Monroe Freeling and Tommy Tremble among those working on the side with training staff.', '2026-10-13T17:57:44.000Z'::timestamptz),
  ('josephperson', 'Jalen Coker and Damien Lewis both in uniform.', '2026-10-13T17:54:51.000Z'::timestamptz),
  ('josephperson', 'Panthers have opened the practice windows for Taylor Moton, Turk Wharton and Trevor Etienne, as Dave Canales had said.
Placed Cam Jackson on IR with a shoulder injury.', '2026-10-13T15:44:29.000Z'::timestamptz),
  ('josephperson', 'Dave Canales: WR Jalen Coker (quad) is "on track" but has a couple of big days of practice ahead of him this week heading into Sunday''s game at PHI.', '2026-10-12T17:30:13.000Z'::timestamptz),
  ('joshweinfuss', 'Cody Simon is down holding his right knee after that 40-yard return by Devin Duvernay.', '2026-10-18T20:18:00.000Z'::timestamptz),
  ('joshweinfuss', 'The Cardinals elevated RB Evan Hull and S Derrick Reed II to the active roster from the practice squad as standard elevations

Arizona also activated s Kitan Crawford from the injured reserve/designated for return list.', '2026-10-17T20:06:25.000Z'::timestamptz),
  ('joshweinfuss', 'Thursday’s injury report for Cardinals-Rams.

No Jeremiyah Love for a second straight day. https://t.co/EsPQ78IeeW', '2026-10-15T23:32:58.000Z'::timestamptz),
  ('joshweinfuss', 'Cardinals rookie RB Jeremiyah Love was not at practice during the open portion today. 

The injury report comes out later this afternoon.', '2026-10-15T20:31:23.000Z'::timestamptz),
  ('joshweinfuss', 'Mike LaFleur said today that there won''t be an offensive "overhaul or anything like that" with Marvin Harrison Jr. not in the picture anymore. 

LaFleur said that the other receivers playing the X - namely rookie Jalen Brooks and Reggie Virgil - have a similar skillset to Harrison "in terms of what we''re asking them to do."', '2026-10-15T00:35:05.000Z'::timestamptz),
  ('joshweinfuss', 'Caserio said the Marvin Harrison Jr. trade was done by Friday night and that Sunday’s game had no bearing on it at all.

He also said the Texans followed Monti’s lead and that it was Monti’s decision to wait until after the game to communicate to MHJ where he was heading.

“I think there was a lot more made of this than there really was," Caserio said. Interesting choice of words.', '2026-10-14T14:15:59.000Z'::timestamptz),
  ('joshweinfuss', 'Mike LaFleur said there’ll be a discussion around noon on Tuesday that’ll include the possibility of moving Carson Beck to the active roster from his emergency QB role.', '2026-10-12T21:53:55.000Z'::timestamptz),
  ('joshweinfuss', 'The Cardinals announce the Marvin Harrison Jr. trade and in their release, included a quote from GM Monti Ossenfort instead of making him available for questions. 

Ossenfort''s quote: “Decisions like this are never easy. Ultimately, we have to do what is best for our football team and that will always be the driving factor. We are extremely grateful to Marvin for what he has contributed to our organization and wish him the very best as he moves forward in his career.”', '2026-10-12T20:21:31.000Z'::timestamptz),
  ('joshweinfuss', 'Cardinals returner/WR Devin Duvernay just walked to the locker room.', '2026-10-11T23:15:21.000Z'::timestamptz),
  ('joshweinfuss', 'Cardinals WR Marvin Harrison Jr. is, indeed, inactive for today''s game against the Lions.', '2026-10-11T18:56:21.000Z'::timestamptz),
  ('kat_terrell', 'Jordyn Tyson traveled with the team to Paris', '2026-10-19T11:50:31.000Z'::timestamptz),
  ('kat_terrell', 'Chris Olave still out with illness https://t.co/9YvVtLpWzl', '2026-10-15T20:25:51.000Z'::timestamptz),
  ('kat_terrell', 'Didn''t see Chris Olave at practice again today', '2026-10-15T19:52:58.000Z'::timestamptz),
  ('kat_terrell', 'The Saints signed wide receiver Kevin Austin Jr. and running back Jarquez Hunter to the practice squad and designated long snapper Zach Wood to return after he returned to practice today.', '2026-10-14T21:38:12.000Z'::timestamptz),
  ('kat_terrell', 'Tyler Shough said he''ll like be wearing a glove again to protect his hand. He said his hand is progressively getting better.', '2026-10-14T20:45:53.000Z'::timestamptz),
  ('kat_terrell', 'Chris Olave, Nathan Shepherd, Vernon Broughton were all sick today', '2026-10-14T20:26:35.000Z'::timestamptz),
  ('kat_terrell', 'Kellen Moore said Jordyn Tyson will not practice this week', '2026-10-12T18:54:20.000Z'::timestamptz),
  ('kat_terrell', 'Tyler Shough was asked if his left hand was broken and he said he wasn’t sure if he could answer that, but it’s banged up.', '2026-10-11T20:42:51.000Z'::timestamptz),
  ('marcraimondi', 'Stefanski: I think at this point we''re just getting Andy [Dalton] up to speed. He''s learning people''s names and learning the system. #Falcons', '2026-10-19T17:12:04.000Z'::timestamptz),
  ('marcraimondi', 'Stefanski says the addition of Dalton does not affect Jack Strand at all. #Falcons', '2026-10-19T17:11:03.000Z'::timestamptz),
  ('marcraimondi', '#Falcons to sign QB Andy Dalton, release QB Cooper Rush https://t.co/uQ0oDhrHJ3', '2026-10-19T14:20:08.000Z'::timestamptz),
  ('marykaycabot', '#Browns Todd Monken gave Jerry Jeudy a game ball “and he deserves it”: https://t.co/8L5QH8Td8S', '2026-10-18T20:28:24.000Z'::timestamptz),
  ('marykaycabot', 'Lamar Jackson, Quinshon Judkins &amp; Carson Schwesinger all idle against Thurs as #Browns &amp; #Ravens prepare for their 1st-place showdown; Zay Flowers added as limited: Takeaways --&gt;  https://t.co/BUklE6uNIt', '2026-10-15T22:55:03.000Z'::timestamptz),
  ('marykaycabot', '#Browns #Ravens injury report for Thursday, including Lamar Jackson sitting out a second straight day: https://t.co/gTxuJUIB6S', '2026-10-15T20:28:29.000Z'::timestamptz),
  ('marykaycabot', 'Quinshon Judkins? Dylan Sampson? Lamar Jackson? Who might be in or out for #Browns vs. #Ravens: --&gt; https://t.co/NGujPujtBY', '2026-10-15T20:10:43.000Z'::timestamptz),
  ('marykaycabot', '#Browns special teams coordinator Byron Storer on if KC Concepcion, recovering from his concussion, will return punts if he plays: ''right now, we''re preparing as if we don''t have him (on returns).'' He has total faith in Denzel Boston to return punts.', '2026-10-15T18:47:38.000Z'::timestamptz),
  ('marykaycabot', 'No #Ravens Lamar Jackson at the start of Thursday''s practice of #Browns week https://t.co/7HFH2MGmBx', '2026-10-15T17:19:19.000Z'::timestamptz),
  ('marykaycabot', '#Browns RB Dylan Sampson practiced for the first time on Thursday of #Ravens week since injuring his knee in the opener vs. #Jaguars and going on IR. Judkins was outside but not practicing during the media viewing period.', '2026-10-15T17:15:29.000Z'::timestamptz),
  ('marykaycabot', 'Skeleton crew again for the #Browns on Thursday of #Ravens week. Not practicing during media viewing: Quinshon Judkins, Carson Schwesinger, Mason Graham, Mike Hall, Derek Barnett, Teven Jenkins and Kalia Davis.', '2026-10-15T17:12:40.000Z'::timestamptz),
  ('marykaycabot', 'Short vid: How KC Concepcion returned to practice just 3 days after getting knocked out cold by #Jets safety Minkah Fitzpatrick and has a shot to face the #Ravens: https://t.co/7CODqS1z0S', '2026-10-15T00:08:27.000Z'::timestamptz),
  ('marykaycabot', '#Ravens Lamar Jackson rests Wed but still has a shot to face the #Browns; Quinshon Judkins and Carson Schwesinger among 11 #Browns who sat out practice: Takeaways --&gt;    https://t.co/klKHO2BBPK', '2026-10-14T23:59:58.000Z'::timestamptz),
  ('marykaycabot', 'Updated w/video &amp; Denzel Boston on seeing his fellow rookie WR KC Concepcion frozen face-down on the field: Concepcion returns to practice for the #Ravens game 3 days after #Jets S Minkah Fitzpatrick knocked him out cold:   https://t.co/pKwZz95xka', '2026-10-14T22:25:33.000Z'::timestamptz),
  ('marykaycabot', '#Browns #Ravens injury report, including Lamar Jackson sitting out with his ankle injury and plenty of DNPs for CLE: https://t.co/JB35kvfnWn', '2026-10-14T20:56:48.000Z'::timestamptz),
  ('marykaycabot', '#Ravens Lamar Jackson (ankle) didn''t practice on Wednesday of #Browns week: https://t.co/YNiUrmCVeJ', '2026-10-14T19:25:24.000Z'::timestamptz),
  ('marykaycabot', '#Browns RB Dylan Sampson (knee) has a chance to return vs. the #Ravens for the 1st time since the opener: ''I miss it'' ---&gt;   https://t.co/IOn52tNIVK', '2026-10-14T18:49:36.000Z'::timestamptz),
  ('marykaycabot', '#Browns RB Dylan Sampson (knee), who''s 21-day practice window opened today, didn''t do anything in the early open part of practice. Monken said there''s a chance he''ll face the #Ravens. WR Tylan Wallace (knee) returned to practice.', '2026-10-14T17:21:01.000Z'::timestamptz),
  ('marykaycabot', '#Browns WR KC Concepcion returns to practice on a limited basis Wednesday of #Ravens week after getting knocked out cold Sunday by #Jets safety Minkah Fitzpatrick and suffering a concussion: --&gt;    https://t.co/pKwZz95xka', '2026-10-14T16:47:23.000Z'::timestamptz),
  ('marykaycabot', '#Browns Todd Monken says “there’s a chance” RB Dylan Sampson (knee) will face the #Ravens on Sunday. He’ll practice today after being designated for return from IR. https://t.co/56UnPDi58e', '2026-10-14T16:17:34.000Z'::timestamptz),
  ('marykaycabot', '#Browns Todd Monken on KC Concepcion (concussion) practicing on a limited basis today after getting knocked out cold on Sunday: https://t.co/6pvnIxoLvy', '2026-10-14T16:10:28.000Z'::timestamptz),
  ('marykaycabot', '#Browns RB Dylan Sampson (knee) has been designated for return from IR and will practice today', '2026-10-14T15:56:39.000Z'::timestamptz),
  ('marykaycabot', '#Browns KC Concepcion (concussion) is progressing very well and is set to practice today. That’s remarkable considering he was knocked out cold when #Jets Minkah Fitzpatrick hit him helmet to helmet.', '2026-10-14T15:52:54.000Z'::timestamptz),
  ('mikereiss', 'Patriots Monday injury report (walkthrough practice):

🏈❌NO PARTICIPATION: K Andy Borregales (personal), C/G Ben Brown (knee), CB Carlton Davis III (neck), DT Joshua Farmer (personal), LG Alijah Vera-Tucker (hamstring)

🏈🤏LIMITED: WR A.J. Brown (ankle), CB Channing  Canada (hamstring), OT Morgan Moses (foot), CB Karon Prunty (hamstring)

🏈🌕FULL: OT Marcus Bryant (ankle), S Kevin Byard III (chest), OT Will Campbell (knee), LB Christian Elliss (chest), RB TreVeyon Henderson (ankle), OLB Dre''Mont Jones (shoulder), QB Drake Maye (right shoulder), S Craig Woodson (shoulder)', '2026-10-20T00:11:40.000Z'::timestamptz),
  ('mikereiss', 'News story: WR Romeo Doubs (shoulder) placed on IR, won''t return until after the bye week at the earliest.

https://t.co/zeYg42SOhL', '2026-10-19T21:09:07.000Z'::timestamptz),
  ('mikereiss', 'Patriots transactions:

🏈 Placed on IR: WR Romeo Doubs (shoulder)

🏈 Signed from practice squad to 53-man roster: S Elliott Davison

🏈 Signed to practice squad: WR Ryan Miller, C/G Andrew Rupcich, C Jacob Rizy

🏈 Released from practice squad: CB D’Shawn Jamison', '2026-10-19T20:05:10.000Z'::timestamptz),
  ('mikereiss', 'RB Corey Kiner said he didn’t realize he was handed the football eight straight times in a fourth-quarter clock-killing drive … until his father Clifton shared that detail with him.

The hard-charging running led to a trip to the interview podium Monday. https://t.co/R0qwx75vcn', '2026-10-19T15:49:39.000Z'::timestamptz),
  ('mikereiss', 'News story: Injuries continue to mount for Patriots as WR Romeo Doubs (shoulder) and offensive linemen Morgan Moses (ankle), Alijah Vera-Tucker (hamstring) and Ben Brown (knee) knocked out of win over Jets.

https://t.co/iU6FZ0K99q', '2026-10-18T22:33:52.000Z'::timestamptz),
  ('mikereiss', 'Patriots injury announcements: WR Romeo Doubs (shoulder) and G Alijah Vera-Tucker (hamstring), will not return.', '2026-10-18T18:49:59.000Z'::timestamptz),
  ('mikereiss', 'Patriots injury announcement: WR Romeo Doubs, shoulder, questionable to return', '2026-10-18T17:38:46.000Z'::timestamptz),
  ('nwagoner', '#49ers have Jordan Watkins and Brandin Cooks at WR to open their first drive of the second half.', '2026-10-20T02:02:50.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Mike Evans (Achilles) has been ruled OUT.', '2026-10-20T01:57:49.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Mike Evans (Achilles) is questionable to return. 

Have to think the Niners would like to let him rest the second half but we''ll see.', '2026-10-20T01:39:21.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Mike Evans makes a 16-yard catch but is slow to get up after and now going straight to locker room. He''s moving slowly.', '2026-10-20T01:30:05.000Z'::timestamptz),
  ('nwagoner', '#49ers starting offense

QB Brock Purdy
RB Christian McCaffrey
FB Kyle Juszczyk 
WR Mike Evans
TE George Kittle
LT Trent Williams
LG Connor Colby
C Jake Brendel
RG Dominick Puni
RT Colton McKivitz
WR Jordan Watkins', '2026-10-20T00:16:42.000Z'::timestamptz),
  ('nwagoner', 'On #49ers WR Demarcus Robinson, coach Kyle Shanahan said he has an "outside chance" to return next week against Atlanta. But more likely after the bye. 

Robinson is eligible to come off IR after the Washington game.', '2026-10-15T23:58:47.000Z'::timestamptz),
  ('nwagoner', '#49ers coach Kyle Shanahan acknowledged that WR Christian Kirk had "some setbacks" in recovery from calf injury. But Kirk had "an awesome weekend" and that spurred opening his practice window. 

Kirk made no promises but said today that he is taking it day by day and will "try to get out there as soon as I can."', '2026-10-15T23:58:04.000Z'::timestamptz),
  ('nwagoner', 'Among the #49ers who will be listed as limited today and were on the field during open portion Thursday: 

CB Upton Stout (shoulder) -- blue no contact jersey
DB Siran Neal (neck) -- blue no contact jersey
FB Kyle Juszczyk (knee)
WR Christian Kirk (calf)

OL Colton McKivitz was slated to be limited but he was just on a side field when we watched.', '2026-10-15T22:02:51.000Z'::timestamptz),
  ('nwagoner', 'Full list of #49ers I did not see participating in early open portion Thursday: 

DE Nick Bosa
DT James Thompson Jr. 
WR Mike Evans 
WR Deebo Samuel
S Marques Sigle
LB Garret Wallow
OL Carver Willis
DT Gracen Halton

OT Colton McKivitz (illness) working on the side.

Normal rest days for CMC, Trent Williams, it appears.', '2026-10-15T21:01:02.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Mike Evans won’t practice today. He is dealing with Achilles soreness, per Kyle Shanahan. That’s in addition to rib issue.', '2026-10-15T19:48:44.000Z'::timestamptz),
  ('nwagoner', 'NEWS: #49ers WR Deebo Samuel going to miss some time with hamstring injury. Also includes updates from Kyle Shanahan on Nick Bosa, Kyle Juszczyk, Garret Wallow, James Thompson Jr. and Nick Martin...

https://t.co/7zeeuWHwzM', '2026-10-12T20:14:13.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Deebo Samuel is “going to miss some time” with a hamstring injury that coach Kyle Shanahan said he “got pretty good.”

LB Garret Wallow also has a hamstring issue that will keep him out a bit.', '2026-10-12T19:24:52.000Z'::timestamptz),
  ('nwagoner', 'With more injuries to deal with at receiver, #49ers coach Kyle Shanahan didn’t sound optimistic that WR Christian Kirk (calf) would return next week, either. He said he wasn’t sure yet but thought probably not as of now.', '2026-10-12T03:47:15.000Z'::timestamptz),
  ('nwagoner', '#49ers WR Deebo Samuel departed Sundays game with a hamstring injury. The extent of it is unclear as more tests await an already depleted receiver group…

 https://t.co/p5yG1LGm52', '2026-10-12T03:43:21.000Z'::timestamptz),
  ('richcimini', 'Breece Hall (quad) is working with trainers on the side field. That’s progress. He’s considered week to week. #Jets', '2026-10-15T16:56:22.000Z'::timestamptz),
  ('richcimini', 'Good nugget from OC Frank Reich: On Braelon Allen’s 22-yard TD run (third-and-9), Reich called a pass play. He was going for the end zone. Geno Smith changed the play to a run.

Reich says it was “elite instincts” and “creative thinking” on Smith’s part. #Jets https://t.co/ffFEtGxAj0', '2026-10-15T16:08:47.000Z'::timestamptz),
  ('richcimini', 'The Jets are opening WR Omar Cooper Jr''s 21-day practice window. He was placed on IR after Week 1 with a high-ankle sprain. #Jets', '2026-10-14T16:47:03.000Z'::timestamptz),
  ('richcimini', 'AD Mitchell did have a surgical procedure to repair his injured finger, Aaron Glenn now acknowledges. He''s week to week. Breece Hall (quad) also week to week. #Jets', '2026-10-14T16:27:40.000Z'::timestamptz),
  ('richcimini', 'Jets transactions: WR Jamaal Pritchett signed to the practice squad, WR Tyler Johnson released from the PS. #Jets', '2026-10-13T13:51:03.000Z'::timestamptz),
  ('richcimini', 'Aaron Glenn, who mentioned after the game how some players could be returning this week, declined to give updates today on any injuries, except to say Kenyon Sadiq is in concussion protocol. #Jets', '2026-10-12T13:44:48.000Z'::timestamptz),
  ('robdemovsky', 'The official designation for Josh Jacobs: https://t.co/wrCGqsYRIi', '2026-10-19T21:21:19.000Z'::timestamptz),
  ('robdemovsky', 'So likely no Davante Adams for the Thanksgiving eve game against the Packers. https://t.co/lZb0Nw2JVp', '2026-10-19T20:53:36.000Z'::timestamptz),
  ('robdemovsky', 'Packers coach Matt LaFleur said Josh Jacobs will practice on Wednesday and get a full week of work but TBD on whether he''ll play on Sunday at Detroit.

"We feel like he''s in a pretty good spot. He''s been training, but he''s missed the exposure to football."', '2026-10-19T20:12:44.000Z'::timestamptz),
  ('robdemovsky', 'Savion Williams played 40 snaps in his season debut and had six touches (four catches and two rushes).

On defense, Isaiah McDuffie and Ty’Ron Hopper continued to rotate at Edgerrin Cooper’s old spot. https://t.co/AQPorW39CC', '2026-10-19T13:26:21.000Z'::timestamptz),
  ('robdemovsky', 'Packers CB Keisean Nixon (groin) back at practice after missing yesterday.

Same for DT Jonathan Ford (calf).

DNPs: CB Benjamin St-Juste (hamstring), WR/KR Skyy Moore (ankle), Javon Hargrave (Achilles, will go to IR) https://t.co/v35OtItnHV', '2026-10-15T17:05:40.000Z'::timestamptz),
  ('robdemovsky', 'DT Jordon Riley (97) is practicing for the first time since his torn Achilles in Week 17 last season.

Likely will need a couple weeks of practice but still good timing considering the Packers just lost DT Javon Hargrave to the same injury. 

CB Keisean Nixon among those working in the rehab group. Must be a new injury. 

Other DNPs: Benjamin St-Juste (hamstring), Skyy Moore (ankle).', '2026-10-14T17:40:01.000Z'::timestamptz),
  ('robdemovsky', 'Packers ST coordinator Cam Achord said Matthew Golden didn’t hesitate to jump in and return punts after Skyy Moore’s injury. 

“You could tell he was ready to go. Made good decisions, confident fielding the ball in the air or off the bounce.”

When asked if Golden’s importance to the offense might make them hesitant to keep him back there, Achord said it comes down to “what’s the best situation for the team.”', '2026-10-13T17:06:27.000Z'::timestamptz),
  ('sarahbarshop', 'A full list of injuries from Sean McVay:

-- WR Davante Adams (ruptured semitendinosus) out 6-10 weeks
-- NT Poona Ford (ruptured triceps) out for season
-- DE Kobie Turner (groin strain) out for “a handful of weeks)
-- K Blake Grupe (torn ACL) out for season', '2026-10-19T21:15:20.000Z'::timestamptz),
  ('sarahbarshop', 'A long list of injuries from Sean McVay.

Davante Adams is out for 6-10 weeks and Poona Ford is out for the season.', '2026-10-19T20:51:21.000Z'::timestamptz),
  ('sarahbarshop', 'Rams CB Trent McDuffie in INACTIVE against the Cardinals.

Other inactives: WR C.J. Daniels, WR Tutu Atwell, QB Ty Simpson (emergency QB), DE Larrell Murchison and OL Bill Murray.', '2026-10-18T18:45:53.000Z'::timestamptz),
  ('sarahbarshop', 'Rams safety Quentin Lake (hip) is ACTIVE against the Bills.

Rams inactives against Buffalo: WR C.J. Daniels, QB Ty Simpson (emergency QB), DE Larrell Murchison, OL Bill Murray and TE Max Klare.', '2026-10-12T22:52:49.000Z'::timestamptz),
  ('sarahbarshop', 'Rams DT Aaron Donald and TE Colby Parkinson both practiced in full today.

S Quentin Lake did not practice for the second day in a row with his hip injury. https://t.co/sgj57oe1oQ', '2026-10-09T22:41:05.000Z'::timestamptz),
  ('seifertespn', 'The Vikings have designated RB Jordan Mason (finger/hand) for return from IR and he will practice Wednesday. Lots of optimism he will be ready for Sunday’s game.', '2026-10-19T20:30:32.000Z'::timestamptz),
  ('seifertespn', 'This suggestion comes after the Vikings signed Odell Beckham Jr. last week, and hosted JuJu Smith-Schuster (along with 2 other WRs) yesterday. Jennings has 2 catches for 9 yards on 5 targets. https://t.co/IBdpDcxMn5', '2026-10-13T18:29:09.000Z'::timestamptz),
  ('seifertespn', 'Kevin O''Connell was asked today about a WR room that includes Justin Jefferson, Jordan Addison, Jauan Jennings, Odell Beckham Jr., Tai Felton, Myles Price and Jeshaun Jones. He noted its versatility, and of Jennings in particular said: "I do believe his opportunities will come." https://t.co/SRwprg80R0 https://t.co/IO0tQh2zSc', '2026-10-12T21:56:20.000Z'::timestamptz),
  ('seifertespn', 'And just like that, the Vikings are trailing 7-3 in New Orleans after dominating the first quarter. They''ll need to regroup on offense without T.J. Hockenson, Christian Darrisaw, Donovan Jackson, Josh Oliver, Jordan Mason and probably Aaron Jones.', '2026-10-11T17:47:33.000Z'::timestamptz),
  ('seifertespn', 'Vikings say Aaron Jones (knee) is QUESTIONABLE to return. He has been in the blue tent for a while.', '2026-10-11T17:41:22.000Z'::timestamptz),
  ('seifertespn', 'T.J. Hockenson is OUT witha concussion. Another injury to a top Vikings offensive player. They''re now without their LT, LG, TE1, TE2 and WR2.', '2026-10-11T17:22:42.000Z'::timestamptz),
  ('seifertespn', 'T.J. Hockenson is walking to the locker room. Remember, TE2 Josh Oliver is on IR. Vikings down to TE3 Gavin Bartholomew. https://t.co/U5vqp36CBd', '2026-10-11T17:08:00.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans Robert Saleh said they''ll discuss Alontae Taylor''s status as a staff and make a decision going forward in what''s best for the team. 

Saleh said although there are some things Josh Williams has to clean up but played a pretty good game.', '2026-10-19T13:30:14.000Z'::timestamptz),
  ('tdavenport_nfl', 'Carnell Tate led all #Titans WRs with 38 snaps. Calvin Ridley was next highest with 28. Here are the rest vs the Colts: https://t.co/exIafjf184', '2026-10-18T23:40:00.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans RB snap counts vs Colts
Tony Pollard 34
Tyjae Spears 11 https://t.co/8Iz0GxTPYu', '2026-10-18T23:38:45.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans injury report for Thursday ahead of Sunday vs the Colts
DNP
-Tyjae Spears (knee)
-Kevin Winston Jr. (quad) 

-Amani Hooker (concussion) was a FULL participant.
-Tony Pollard (NIR), John Franklin-Myers (NIR) returned https://t.co/SPUE1AInkV', '2026-10-15T20:20:46.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans injury report for Wednesday ahead of Sunday vs the Colts
DNP
Kevin Winston Jr. (quad), Tony Pollard (NIR) 

LIMITED 
Marcus Harris (ankle), Amani Hooker (concussion), David Martin-Robinson (hamstring)', '2026-10-14T20:27:42.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans practice report for Wednesday ahead of Sunday vs the Colts
-Amani Hooker returned.
-No sign of John Franklin-Myers, Tony Pollard, Kevin Winston Jr.', '2026-10-14T19:48:11.000Z'::timestamptz),
  ('tdavenport_nfl', 'No Tony Pollard, John Franklin-Myers at practice today for #Titans.', '2026-10-14T16:28:36.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans Robert Saleh said the decision to keep Cam Ward as the QB is an overall coaching decision, not just his alone. He acknowledged yesterday was a stepback for Ward, but also for the whole offense.', '2026-10-12T13:22:21.000Z'::timestamptz),
  ('tdavenport_nfl', 'Carnell Tate once again led the #Titans WRs in snaps (43). Elic Ayomanor with 32 and Calvin Ridley with 31. Here are the rest vs the Texans: https://t.co/ZKoGqFdufo', '2026-10-11T23:05:05.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans RB snap counts vs Texans
Tony Pollard 30
Tyjae Spears 29 https://t.co/B1WbMB08WF', '2026-10-11T23:02:58.000Z'::timestamptz),
  ('tdavenport_nfl', 'Robert Saleh said Cam Ward is the QB this year. There''s no thought to benching him.', '2026-10-11T21:10:37.000Z'::timestamptz),
  ('tim_mcmanus', 'Andy Dalton lands in Atlanta https://t.co/cwThb3TfRI', '2026-10-19T21:27:23.000Z'::timestamptz),
  ('tim_mcmanus', 'Britain Covey had his right arm/shoulder checked by trainers on the sideline after that hit on kick return but is now back with his teammates.', '2026-10-18T19:13:41.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles RB Carson Steele (shoulder) has been ruled out', '2026-10-18T18:57:37.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles edge Nolan Smith to the medical tent after helmet-to-helmet contact with Chuba Hubbard during  pass rush.', '2026-10-18T18:01:26.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles RB Carson Steele (shoulder) is questionable to return.', '2026-10-18T17:40:30.000Z'::timestamptz),
  ('tim_mcmanus', 'Carson Steele to the medical tent. A trainer was holding his right arm as he made his way off the field.', '2026-10-18T17:30:57.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles inactives:

Saquon Barkley
Jalyx Hunt
Michael Carter II
A.J. Epenesa
Hollywood Brown
Joe Milton', '2026-10-18T15:33:49.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles announce that the following players have been ruled out of tomorrow''s game against Carolina: 

G Landon Dickerson (knee)

CB Jakorian Bennett (knee)

TE Grant Calcaterra (back)

 TE Eli Stowers (quad)', '2026-10-17T22:23:19.000Z'::timestamptz),
  ('tim_mcmanus', 'No injury designation for DeVonta Smith https://t.co/9uoG3Z2RMu', '2026-10-16T20:14:28.000Z'::timestamptz),
  ('tim_mcmanus', 'DeVonta Smith said "I''m good" when asked about his hamstring. He said whether he plays Sunday is "up to the doctors."

Jonathan Greenard said he would test his ankle pregame, as he did last week in London. https://t.co/7mU2wNaYg7', '2026-10-16T18:41:52.000Z'::timestamptz),
  ('tim_mcmanus', 'I did not see Saquon Barkley at practice.

C Drew Kendall was warming up, wearing a knee brace.

Saw Jonathan Greenard out there, too https://t.co/6WdX6Dwpaf', '2026-10-16T16:47:45.000Z'::timestamptz),
  ('tim_mcmanus', 'Devonta Smith is out here, helmet by his side.

A limited participant yesterday, feels like the signs around him are becoming more encouraging. https://t.co/ZBqRyj8J2W', '2026-10-16T16:14:46.000Z'::timestamptz),
  ('tim_mcmanus', 'Some progress for DeVonta Smith, who was limited at Thursday’s practice. https://t.co/LEZPtQADPY', '2026-10-15T21:24:02.000Z'::timestamptz),
  ('tim_mcmanus', 'Did not see Saquon Barkley during short time we were out at Eagles practice.

Devonta Smith was warming up but did not have a helmet on when we were out there', '2026-10-15T18:22:59.000Z'::timestamptz),
  ('tim_mcmanus', 'Devonta Smith listed with a toe injury to go with the hamstring https://t.co/rcwy3ejoSv', '2026-10-14T22:10:24.000Z'::timestamptz),
  ('tim_mcmanus', 'Jalen Hurts, asked about being listed on Friday’s injury report with a calf injury, said he got “nicked up” in the Rams game the week before.

He indicated that’s why he came out for the Jaguars game at the last minute so he could rest.', '2026-10-14T21:30:38.000Z'::timestamptz),
  ('tim_mcmanus', 'Didn’t see Saquon Barkley at start of Eagles practice.

Devonta Smith was working off to the side.

Jonathan Greenard and Marcus Epps among the injured players who were practicing. https://t.co/HhSAYQ435y', '2026-10-14T18:49:42.000Z'::timestamptz),
  ('tim_mcmanus', 'The Eagles opened the practice windows for DB Jakorian Bennett, TE Grant Calcaterra, G Landon Dickerson, and TE Eli Stowers.

They are also signing DB Dean Clark to the Practice Squad.', '2026-10-14T18:32:43.000Z'::timestamptz),
  ('tim_mcmanus', 'Eagles coach Nick Sirianni said he’s “hopeful” he’ll get some offensive reinforcements this week.

He was asked specifically about Saquon Barkley and DeVonta Smith.', '2026-10-12T19:23:39.000Z'::timestamptz),
  ('toddarcher', 'Brian Schottenheimer said Dee Winters (Achilles strain) and KaVontae Turpin (ribs) are likely to miss Monday''s game vs. Philly. Cobie Durant (hamstring) is, "trending up," but will need to practice. DeMarvion Overshown (hamstring) is looking at his first action since the opener.', '2026-10-19T22:50:43.000Z'::timestamptz),
  ('toddarcher', 'Brian Schottenheimer said he considered taking a timeout after Dak Prescott took a big hit one play before his first interception.

“He’s a warrior. He got the wind knocked out of him, and he’s tough as nails, man, and an elite competitor …I said, ‘Are you OK?’ And he kind of gave me the head nod. I don’t think that (hit) had anything to do with (the turnover).”

Prescott said after the game he would not need X rays, that it’s just a bruise.', '2026-10-19T06:04:18.000Z'::timestamptz),
  ('toddarcher', 'Dak Prescott took a hit from Zaire Franklin on the pass before he was intercepted. He was slow to get up but did not appear to get extra attention and is prepared to take the field for the Cowboys'' next possession.', '2026-10-19T01:26:28.000Z'::timestamptz),
  ('toddarcher', 'KaVontae Turpin has been ruled out with a rib injury.', '2026-10-19T00:52:17.000Z'::timestamptz),
  ('toddarcher', 'KaVontae Turpin heads to the locker room with a rib injury. He is questionable to return. Could be big loss in the return game.', '2026-10-19T00:46:26.000Z'::timestamptz),
  ('toddarcher', 'Officially DeMarvion Overshown was a DNP even though he went through individual drills. Tyler Guyton (back), CeeDee Lamb (thigh) went through a full workout. Von Miller got a vet day. https://t.co/AiobTJEQCu', '2026-10-14T20:57:59.000Z'::timestamptz),
  ('toddarcher', 'The Cowboys are expected to re-sign RB Emari Demercado back to the 53-man roster with the spot created by the releasing of OL Nick Leverett on Monday. The plan is for Leverett to join the practice squad.', '2026-10-13T15:08:31.000Z'::timestamptz),
  ('aaronwilson_nfl', 'Practice squad signings:
#Bears K.C. Eziomume
#Lions DeAndre Carter
#Seahawks Jackson Acker, Josiah Deguara, released Dontae McMillan, Malick Meiga', '2026-10-19T21:49:58.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Patriots IR Romeo Doubs, sign Elliott Davison to 53, signed Ryan Miller, Jacob Rizy and Andrew Rupcich to the practice squad and released D’Shawn Jamison from the practice squad', '2026-10-19T21:05:56.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Commanders IR Jacory Croskey-Merritt', '2026-10-19T21:02:41.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Vikings designate Jordan Mason for return', '2026-10-19T21:02:22.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Texans coach DeMeco Ryans on Tank Dell status: ''We''ll see Tank out there Sunday vs. the Giants. Very excited to see him back.'' #tankdell', '2026-10-19T19:38:51.000Z'::timestamptz),
  ('aaronwilson_nfl', 'Tank Dell making progress in recovery from knee injury, but, as #Texans coach DeMeco Ryans said, team has another week to make decision on whether they activate him from injured reserve-designated for return. David Montgomery (groin) and Jalen Pitre (AC shoulder sprain) have been slated to miss #Jaguars game all week.', '2026-10-15T21:36:51.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Texans rule out Tank Dell, David Montgomery and Jalen Pitre and won''t travel to London for #Jaguars game', '2026-10-15T21:21:54.000Z'::timestamptz),
  ('aaronwilson_nfl', '#49ers designate Christian Kirk for return', '2026-10-15T20:39:45.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Texans wide receiver Tank Dell in his second week of practice after being designated for return. Dell is making steady progress in comeback from major knee injury two years ago at Arrowhead Stadium
More from DeMeco Ryans: https://t.co/9xTOsK8Xbu', '2026-10-15T17:06:25.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Texans wide receiver Marvin Harrison Jr., second practice with team. Plan vs. #Jaguars is for him to play, be involved, not a full workload yet, though, after trade from #Cardinals
@KPRC2 
@KPRC2RandyMc https://t.co/gklfh587GX', '2026-10-15T16:29:20.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Texans who didn''t practice: Azeez Al-Shaair (groin), Jalen Pitre (AC shoulder sprain), Trent Brown (knee), David Montgomery (groin)
Limited: Nico Collins (rest), Ja''Marcus Ingram (elbow), Dalton Schultz (ret), Jadeveon Clowney (knee), Logan Hall ( rest)
Full: Tank Dell (knee), Wade Woodaz (thumb)', '2026-10-14T21:32:38.000Z'::timestamptz),
  ('aaronwilson_nfl', 'Designated for return: #Ravens Ja''Kobi Lane
#Saints Zach Wood', '2026-10-14T21:29:20.000Z'::timestamptz),
  ('aaronwilson_nfl', '#Cardinals sign Jerome Ford, Shedrick Jackson, Riley Wilson to practice squad, signed Shaun Bowman to 53, designated Kitan Crawford for return', '2026-10-14T21:27:51.000Z'::timestamptz),
  ('adamschefter', 'Mike Evans (achilles) is out for the remainder of the game. https://t.co/J8ppyZUINk', '2026-10-20T02:02:15.000Z'::timestamptz),
  ('adamschefter', '49ers say WR Mike Evans (achilles) is questionable to return tonight.', '2026-10-20T01:41:09.000Z'::timestamptz),
  ('adamschefter', 'Commanders officially ruled out WR Terry McLaurin due to a knee injury.', '2026-10-20T01:00:45.000Z'::timestamptz),
  ('adamschefter', '49ers WR Mike Evans is active tonight vs. the Commanders. https://t.co/Kg5iWYBhYJ', '2026-10-19T22:46:31.000Z'::timestamptz),
  ('adamschefter', 'Commanders WR Stefon Diggs is active tonight vs. the 49ers.', '2026-10-19T22:45:34.000Z'::timestamptz),
  ('adamschefter', 'More about the Rams suffering multiple significant injuries, including to WR Davante Adams, who now is out 6-10 weeks:

https://t.co/7MnuT5bUC4', '2026-10-19T21:22:11.000Z'::timestamptz),
  ('adamschefter', 'Rams HC Sean McVay told reporters that WR Davante Adams ruptured his hamstring and now will be sidelined 6-10 weeks.', '2026-10-19T20:52:23.000Z'::timestamptz),
  ('adamschefter', 'Commanders placed RB Jacory Croskey-Merritt on injured reserve due to his groin injury.', '2026-10-19T20:27:54.000Z'::timestamptz),
  ('adamschefter', 'Patriots officially placed WR Romeo Doubs on injured reserve.', '2026-10-19T20:03:57.000Z'::timestamptz),
  ('adamschefter', 'Trey Amos, Jordan Magee and Jeremy McNichols are all coming off injured reserve for tonight’s game against San Francisco.

Stefon Diggs also trending towards playing tonight.', '2026-10-19T20:00:25.000Z'::timestamptz),
  ('adamschefter', 'Lamar Jackson update: https://t.co/TAhkbnYqVH', '2026-10-19T19:49:32.000Z'::timestamptz),
  ('adamschefter', 'Texans HC DeMeco Ryans announced that WR Tank Dell is going to play Sunday vs. the Giants in what will be his first NFL game since December 2024.', '2026-10-19T19:40:11.000Z'::timestamptz),
  ('adamschefter', 'Bills safety C.J. Gardner-Johnson is being suspended one game after cameras captured him spitting at Raiders TE Brock Bowers. https://t.co/ETjKhMUqt8', '2026-10-19T18:57:00.000Z'::timestamptz),
  ('adamschefter', 'Jalen Hurts will be out for the season after doctors discovered multiple blood clots in his lungs. https://t.co/PYfJpO16FS', '2026-10-19T14:18:02.000Z'::timestamptz),
  ('adamschefter', 'In a corresponding move, the Falcons are releasing veteran QB Cooper Rush, per source. https://t.co/ry8nE6LP8m', '2026-10-19T13:44:03.000Z'::timestamptz),
  ('caplannfl', 'No game status designation for DeVonta Smith💪💪 https://t.co/kq22jV7WeC', '2026-10-16T20:04:13.000Z'::timestamptz),
  ('caplannfl', 'Mack Hollins to IR ... https://t.co/2SesSZQyK7', '2026-10-10T20:05:04.000Z'::timestamptz),
  ('mikegarafolo', 'So much positive energy and promise for Terry McLaurin coming into this season. Now seems it’ll be cut short by a significant injury. Hate to see that for one of the league’s really good guys. https://t.co/bvBBBvW52A', '2026-10-20T00:53:18.000Z'::timestamptz),
  ('mikegarafolo', '#Commanders WR Stefon Diggs and #49ers WR Mike Evans both officially active tonight.', '2026-10-19T22:47:53.000Z'::timestamptz),
  ('mikegarafolo', 'Some terrible #Rams injury news from Sean McVay today: 

WR Davante Adams (hamstring) out 6-10 weeks
DT Kobie Turner (groin) headed to IR
K Blake Grupe (knee) out for the season https://t.co/SfMU8uq8xt', '2026-10-19T20:54:32.000Z'::timestamptz),
  ('mikegarafolo', 'The #49ers ruled out WR Christian Kirk for tonight and elevated WR Malik Turner and LB Jalen Graham from the practice squad.', '2026-10-19T20:09:16.000Z'::timestamptz),
  ('mikegarafolo', 'Andy Dalton had a few options, including a return to the #Eagles. On his way to Atlanta to join the #Falcons. https://t.co/VtwsRNHm4x', '2026-10-19T13:42:54.000Z'::timestamptz),
  ('mikegarafolo', 'J.J. McCarthy in at QB for the #Giants.', '2026-10-18T19:41:41.000Z'::timestamptz),
  ('mikegarafolo', '#Eagles have now ruled out Carson Steele with a shoulder injury. https://t.co/3IUdfW1xv0', '2026-10-18T18:58:15.000Z'::timestamptz),
  ('mikegarafolo', 'DJ Moore and Ed Oliver inactive for the #Bills once again. https://t.co/a1UOyr19fD', '2026-10-18T18:56:04.000Z'::timestamptz),
  ('mikegarafolo', '#Eagles RB Carson Steele questionable to return with a shoulder injury.', '2026-10-18T17:41:29.000Z'::timestamptz),
  ('mikegarafolo', '#Eagles WR DeVonta Smith upgraded to limited participant. Still hearing optimism he’ll play Sunday. We’ll see. Saquon Barkley remains sidelined. https://t.co/n8jlLVTi4e', '2026-10-15T21:25:07.000Z'::timestamptz),
  ('mikegarafolo', 'The #Seahawks elevated WR Irv Charles and LB Jimmy Ciarlo ahead of tonight’s game against the #Broncos.

It’ll be Ciarlo’s second career game. The 2024 #Jets undrafted free agent from Army became a fan favorite on last summer’s Hard Knocks with the #Bills. https://t.co/VT5GCGXv1Z', '2026-10-15T20:23:34.000Z'::timestamptz),
  ('mikegarafolo', 'Caleb Williams on the reaction to his reaction on the cart after his hamstring injury: “Not being able to be out there was frustrating. That was more of the tears or whatever that was. The other half of it was everybody making jokes and all that, but that doesn’t bother me.”

The #Bears’ QB was asked about the grade of his hamstring tear. Says that information doesn’t deserve to be put out publicly after all of the false reporting about his injury.', '2026-10-15T20:06:20.000Z'::timestamptz),
  ('mikegarafolo', '#Bears QB Caleb Williams on his hamstring: “It’s felt good but it’s different when you have to go through a whole week of practice and you’ve got to prepare for a game and all that, the stress on the mind, body and spirit.” https://t.co/93dSPMV9hZ', '2026-10-15T19:59:56.000Z'::timestamptz),
  ('mikegarafolo', 'The #Bears list Caleb Williams as a full go today after yesterday’s projected full status. https://t.co/tvPbMFW9oh', '2026-10-15T19:31:58.000Z'::timestamptz),
  ('mikegarafolo', 'More on Andy Dalton: Sources say he has offers from multiple teams he’s been mulling for a few days now. The #Eagles had left the door open for his return on their practice squad and that was before Jalen Hurts latest blood-clot developments. TBD where he’ll wind up next. https://t.co/d97GM9erRz', '2026-10-15T18:37:23.000Z'::timestamptz),
  ('mikegarafolo', 'Andy Dalton is an option to return for the #Eagles. He’s had a few teams check in with him since the team released him, per sources, though there’s familiarity and a clear role in Philly for him if he decides to return. https://t.co/bNeypdIjiO', '2026-10-15T17:09:35.000Z'::timestamptz),
  ('mikegarafolo', 'Meanwhile, no Lamar Jackson at practice today for the #Ravens. https://t.co/ulYZ8DjoL7', '2026-10-15T17:04:17.000Z'::timestamptz),
  ('mikegarafolo', 'Baker Mayfield working his way back but not there yet. It’ll be Jalon Daniels against the #Steelers. https://t.co/t7e7U8MFVV', '2026-10-15T15:40:46.000Z'::timestamptz),
  ('mikegarafolo', 'The #Patriots are opening the practice window for A.J. Brown, Mike Vrabel said. https://t.co/O70lbEkQZR', '2026-10-14T17:01:48.000Z'::timestamptz),
  ('mikegarafolo', 'From @gmfb: Baker Mayfield badly wants to return for the #Buccaneers but odds are it’ll be Jalon Daniels at QB for one more week. Plus, the #Ravens’ Lamar Jackson and the #Bears’ Caleb Williams are inching back while Chicago won’t have the suspended Montez Sweat. https://t.co/Tuu0zR9Yhr', '2026-10-14T13:30:27.000Z'::timestamptz),
  ('mikegarafolo', '#Ravens WR Ja’Kobi Lane is expected to return to practice, four weeks after wrist surgery, per me and @RapSheet. The rookie, who impressed in camp and was set to have a big role in the team’s offense, has a shot to play this weekend, per HC Jesse Minter. https://t.co/tsiuXgj7XU', '2026-10-14T13:12:29.000Z'::timestamptz),
  ('mikegarafolo', 'A kicker change for the #Rams: They’re releasing Harrison Mevis and signing Blake Grupe off the #Jets’ practice squad, sources tell me and @RapSheet. A move at the position after last night’s overtime blocked field goal. https://t.co/lbbxd2CoCW', '2026-10-13T17:20:01.000Z'::timestamptz),
  ('mikegarafolo', 'From @gmfb: The #Rams’ Alaric Jackson’s shot at the #Bills’ Bradley Chubb will be reviewed, Patriots WR A.J. Brown has a chance to return this week, #Packers pass rusher Micah Parsons does not and the #49ers’ Dre Greenlaw is appealing his suspension. https://t.co/MMjB3sU5C1', '2026-10-13T12:29:25.000Z'::timestamptz),
  ('mikegarafolo', 'Indications are one, if not both, DeVonta Smith and Saquon Barkley have a shot to return against the #Panthers, though the #Eagles have to see how the practice week goes. https://t.co/JbVwyvjNRq', '2026-10-12T19:36:53.000Z'::timestamptz),
  ('mikegarafolo', '#Lions returner Tom Kennedy suffered a significant MCL injury that is expected to require surgery and will end his season, sources tell me and @RapSheet. HC Dan Campbell was hopeful Kennedy’s absence would be shorter but further testing revealed the extent of the damage. https://t.co/qhZfMKlGpI', '2026-10-12T16:55:52.000Z'::timestamptz),
  ('rapsheet', '#49ers WR Mike Evans (Achilles) has been ruled out for rest of game.', '2026-10-20T02:02:52.000Z'::timestamptz),
  ('rapsheet', '#Commanders WR Terry McLaurin has already been ruled out with a knee injury. https://t.co/jNkvQoFAlM', '2026-10-20T01:01:32.000Z'::timestamptz),
  ('rapsheet', 'A potentially serious knee injury for Terry McLaurin. https://t.co/qcD6JQAIhE', '2026-10-20T00:50:48.000Z'::timestamptz),
  ('rapsheet', 'Here is our full story on the #Rams and their slew of injuries — notably Davante Adams headed to IR: https://t.co/tt45Pkt81D

https://t.co/tt45Pkt81D', '2026-10-19T23:00:36.000Z'::timestamptz),
  ('rapsheet', 'All hands on deck: Both #Commanders WR Stefon Diggs and #49ers WR Mike Evans are officially active tonight. Evans did not practice all week.', '2026-10-19T22:48:37.000Z'::timestamptz),
  ('rapsheet', 'Davante Adams is expected to have a procedure on his hamstring tendon to clean it out, with hopes that he can return around the time of the bye or a little after. https://t.co/xNkfCu21hp', '2026-10-19T21:17:22.000Z'::timestamptz),
  ('rapsheet', 'Bad to worse: #Rams star WR Davante Adams, who sustained a hamstring injury in last night’s loss to the #AZCardinals, is out 6-10 weeks. https://t.co/FO80VAb5NM', '2026-10-19T20:56:34.000Z'::timestamptz),
  ('rapsheet', '#Vikings RB Jordan Mason has been designated for return. His practice window opens, though he’s still on IR.', '2026-10-19T20:32:00.000Z'::timestamptz),
  ('rapsheet', 'The #Patriots placed WR Romeo Doubs on injured reserve with a shoulder injury and signed DB Elliott Davison to the 53-man roster from the practice squad.', '2026-10-19T20:03:57.000Z'::timestamptz),
  ('rapsheet', 'Good news: The #Commanders have activated CB Trey Amos from IR, as well as LB Jordan Magee and RB Jeremy McNichols

Bad news: RB Jacory Croskey-Merritt Is headed to IR with a groin injury.', '2026-10-19T20:01:21.000Z'::timestamptz),
  ('rapsheet', 'Coach DeMeco Ryans just announced that WR Tank Dell is going to play on Sunday vs the #Giants, his first game since December 2024. https://t.co/BiMDS6Q7oU', '2026-10-19T19:41:04.000Z'::timestamptz),
  ('rapsheet', 'Potentially one more week of Jalon Daniels... https://t.co/xKijBiJe2a', '2026-10-19T16:33:02.000Z'::timestamptz),
  ('rapsheet', 'From @GMFB: A full explanation of the latest with #Eagles QB Jalen Hurts, who was revealed to have multiple blood clots in his lungs. https://t.co/bSqfXlmn6w', '2026-10-19T16:24:28.000Z'::timestamptz),
  ('rapsheet', 'Here is the full story on #Eagles QB Jalen Hurts, whose season is expected to be over as he undergoes treatment for blood clots: https://t.co/wjsi7R9Nxs

https://t.co/wjsi7R9Nxs', '2026-10-19T16:09:24.000Z'::timestamptz),
  ('rapsheet', '#Eagles QB Jalen Hurts, who is out for the season after several blood clots were revealed in his lungs, has been undergoing tests for days.

Before the London game, Hurts was in the hospital until 4 am and did not sleep because sleep was a risk. He played without having slept. https://t.co/avMUeBBOua', '2026-10-19T14:22:51.000Z'::timestamptz),
  ('rapsheet', 'More details: What was originally believed to be a superficial blood clot was then revealed Saturday afternoon to be several blood clots in Jalen Hurts'' lungs. At that point, it all changed. It is serious. It is scary.

And Jalen Hurts should make a full recovery. https://t.co/riJ68k5Q8H', '2026-10-19T14:16:32.000Z'::timestamptz),
  ('rapsheet', 'From a football standpoint, Jalen Hurts should be able to recover after three months of treatment. The blood clot was "provoked" which means there was a cause -- getting cleated in his calf. 

That indicates it is a solvable issue with treatment and care https://t.co/Ls26deT7wl', '2026-10-19T14:14:24.000Z'::timestamptz),
  ('rapsheet', 'This statement details why there was such a dramatic change in the diagnosis for Jalen Hurts. When doctors found multiple blood clots in his lungs, it went from being able to manage it to immediate treatment.

Hurts is out for the season. https://t.co/5rYLhTYGuF', '2026-10-19T14:13:06.000Z'::timestamptz),
  ('rapsheet', 'Jalen Hurts will be out an estimated three months as he undergoes treatment. https://t.co/riJ68k5Q8H', '2026-10-19T14:11:43.000Z'::timestamptz),
  ('rapsheet', 'A lengthy and detailed statement on Jalen Hurts from his agent and the #Eagles. https://t.co/riJ68k5Q8H', '2026-10-19T14:11:17.000Z'::timestamptz),
  ('tompelissero', 'The Patriots placed WR Romeo Doubs on injured reserve.', '2026-10-19T20:03:26.000Z'::timestamptz),
  ('tompelissero', 'Texans coach DeMeco Ryans announced WR Tank Dell will play Sunday against the Giants — Dell’s first game since a major leg injury in 2024.', '2026-10-19T19:40:19.000Z'::timestamptz),
  ('tompelissero', 'Just spoke to Jalen Hurts’ agent, Nicole Lynn, who clarified that while Hurts was up until early Sunday morning getting evaluated at a hospital, he was able to sleep upon rejoining the team and the Eagles set aside a room for him at the stadium. Videos from the stadium show Hurts coming onto the field just before kickoff and he felt rested enough to play.', '2026-10-19T18:58:32.000Z'::timestamptz),
  ('tompelissero', 'The Eagles were waiting to get all the information on Jalen Hurts before having any discussions or making decisions on injured reserve, etc., focusing solely on his health. The tests showing blood clots in his lungs came back Saturday. All parties continue to work together. https://t.co/rAm0xGN9us', '2026-10-19T14:36:06.000Z'::timestamptz),
  ('tompelissero', 'Statement from Jalen Hurts'' agent, Nicole Lynn, who says the current diagnosis is a deep vein thrombosis as well as bilateral pulmonary emboli -- blood clots that have traveled to an artery in his lungs. https://t.co/tLfvTR5SFi', '2026-10-19T14:23:34.000Z'::timestamptz),
  ('tompelissero', 'How committed is Jalen Hurts to football? After initially being diagnosed with a superficial blood clot in London, doctors told him not to sleep as a precaution, so he had been awake for roughly 36 hours when he started against the Jaguars, throwing for 220 yards and a TD. https://t.co/rAm0xGNHk0', '2026-10-19T14:19:54.000Z'::timestamptz),
  ('tompelissero', 'Jalen Hurts'' injury initially occurred when he was cleated against the Rams. So, doctors have a handle on what caused the blood clots and a plan to resolve it with no long-term effects. Eagles GM Howie Roseman has worked with Hurts and his agent, Nicole Lynn, throughout the process and everyone is on the same page.', '2026-10-19T14:16:23.000Z'::timestamptz),
  ('tompelissero', 'Eagles QB Jalen Hurts is expected to be sidelined for multiple months after new imaging over the weekend found several blood clots in his lungs. 

Hurts is now on blood thinners and should have no long-term effects. But it’s unlikely he plays again this season. https://t.co/iLhCBu0Isa', '2026-10-19T14:11:14.000Z'::timestamptz),
  ('tompelissero', 'The NFL fined Jets safety Minkah Fitzpatrick $17,911 for the hit that knocked out Browns WR KC Concepcion last week, plus another  $11,941 for a facemask earlier in the game. https://t.co/sqgPnNuMNM', '2026-10-17T20:10:26.000Z'::timestamptz),
  ('tompelissero', 'Bucs QB Baker Mayfield will miss a third consecutive game since dislocating his thumb in Week 3. But there’s optimism he’ll return next week — just in time for Tampa Bay’s first division game of the season at Carolina.

More in The Sweep: https://t.co/hVvUAJDNjT https://t.co/HwpFcNzTQY', '2026-10-17T13:04:48.000Z'::timestamptz),
  ('tompelissero', 'Josh Jacobs will immediately return as the Packers’ starting running back next week at Detroit. 

Meanwhile, Micah Parsons still isn’t ready to practice, making it unlikely he plays before Nov. 8 against the Patriots at the soonest. 

More in The Sweep: https://t.co/hVvUAJDNjT https://t.co/2M9OZC0qlY', '2026-10-17T12:58:54.000Z'::timestamptz),
  ('tompelissero', 'Barring a setback, the Patriots are expected to activate star WR A.J. Brown from injured reserve today and he’ll play Sunday against the Jets.

More in The Sweep: https://t.co/hVvUAJDNjT https://t.co/SCfWgn5cNJ', '2026-10-17T12:54:56.000Z'::timestamptz),
  ('tompelissero', 'The NFL''s personal conduct investigations regarding Packers RB Josh Jacobs and Broncos OLB Jonathan Cooper continue and additional discipline is possible depending on the findings. But after missing six games -- the baseline suspension for personal conduct violations involving domestic violence -- both are back.', '2026-10-16T19:47:56.000Z'::timestamptz),
  ('tompelissero', 'The NFL will remove Packers RB Josh Jacobs from the commissioner exempt list Monday, sources tell @ringer @netflixsports. https://t.co/GeeF5MXBUE', '2026-10-16T19:45:29.000Z'::timestamptz),
  ('underdognfl', 'Schultz: Marquez Valdes-Scantling expected to sign with Steelers'' practice squad.', '2026-10-20T02:13:49.000Z'::timestamptz),
  ('underdognfl', 'Status alert: Mike Evans (Achilles) won''t return Monday. https://t.co/ypevtqqY8h', '2026-10-20T01:58:07.000Z'::timestamptz),
  ('underdognfl', 'Status alert: Mike Evans (Achilles) questionable to return Monday.', '2026-10-20T01:39:26.000Z'::timestamptz),
  ('underdognfl', 'Status alert: Mike Evans headed to locker room with trainers Monday.', '2026-10-20T01:30:56.000Z'::timestamptz),
  ('underdognfl', 'Status alert: Terry McLaurin (leg) carted off field Monday.', '2026-10-20T00:50:30.000Z'::timestamptz),
  ('underdognfl', 'Status alert: Terry McLaurin down on field with trainers Monday.', '2026-10-20T00:48:21.000Z'::timestamptz),
  ('underdognfl', 'Kyle Monangai (thumb, toe) listed as DNP in practice Monday.', '2026-10-19T23:57:58.000Z'::timestamptz),
  ('underdognfl', 'Fowler: Romeo Doubs (shoulder) hopeful to return after Week 11 bye.', '2026-10-19T23:38:30.000Z'::timestamptz),
  ('underdognfl', 'Macdonald: Zach Charbonnet (knee) has "good chance" to make season debut in Week 7, via @gbellseattle.', '2026-10-19T22:49:29.000Z'::timestamptz),
  ('underdognfl', 'Mike Evans (Achilles, ribs) active for Week 6.', '2026-10-19T22:45:37.000Z'::timestamptz),
  ('underdognfl', 'Stefon Diggs (hamstring) active for Week 6.', '2026-10-19T22:45:24.000Z'::timestamptz),
  ('underdognfl', 'Rams injuries from Week 6:

DT Kobie Turner - IR
DT Poona Ford - Out for season
WR Davante Adams - 6-10 Weeks
K Blake Grupe - IR', '2026-10-19T20:55:36.000Z'::timestamptz),
  ('underdognfl', 'McVay: Davante Adams (knee) will miss 6-10 weeks.', '2026-10-19T20:51:18.000Z'::timestamptz),
  ('underdognfl', 'Jordan Mason (thumb) has 21-day practice window opened.', '2026-10-19T20:30:31.000Z'::timestamptz),
  ('underdognfl', 'LaFleur: Josh Jacobs will get a full week of practice:

"We feel like he''s in a pretty good spot. He''s been training."', '2026-10-19T20:12:20.000Z'::timestamptz),
  ('underdognfl', 'Christian Kirk (calf) ruled out for Week 6.', '2026-10-19T20:08:16.000Z'::timestamptz),
  ('underdognfl', 'Romeo Doubs (shoulder) placed on IR; will miss at least 4 games, per @DougKyed.', '2026-10-19T20:02:18.000Z'::timestamptz),
  ('underdognfl', 'Schefter: Stefon Diggs (hamstring) trending towards playing Week 6.', '2026-10-19T20:01:02.000Z'::timestamptz),
  ('bynatetaylor', 'Travis Kelce is back on the field.', '2026-10-18T20:37:29.000Z'::timestamptz),
  ('bynatetaylor', 'Travis Kelce, who sustained a right ankle injury on the Chiefs’ opening drive, took his cleat off to get his right foot &amp; ankle tapped up.', '2026-10-18T20:32:11.000Z'::timestamptz),
  ('bynatetaylor', 'New story. Rashee Rice is out against the Chargers with hamstring injury. Andy Reid suggested it''s possible Rice could be available next week when the Chiefs play the Seahawks.

"He''s a pretty fast healer."
https://t.co/cXL0Ee4T6R', '2026-10-16T20:11:20.000Z'::timestamptz),
  ('bynatetaylor', 'Andy Reid said Rashee Rice (right hamstring) &amp; Josh Simmons (bulging disc in lower back) are both out for Sunday''s game against the Chargers.', '2026-10-16T18:04:34.000Z'::timestamptz),
  ('bynatetaylor', 'Andy Reid said Rashee Rice is the lone player who is not going to practice.

This will be Josh Simmons'' first practice in almost two months.', '2026-10-14T16:48:32.000Z'::timestamptz),
  ('bynatetaylor', 'Andy Reid, following the Chiefs'' bye, said the team signed Justin Watson to the practice squad. Tyquan Thornton (left ankle) is expected to be placed on IR.

Reid on Josh Simmons: "Josh was here all [last] week doing his rehab. They''ll be back tomorrow &amp; I''ll have a better idea."', '2026-10-12T16:59:16.000Z'::timestamptz),
  ('mattderrick', 'Chiefs injuries Sunday vs. Chargers:

* RT Jaylon Moore (concussion protocol) was the one Andy Reid says stands out the most
* TE Travis Kelce rolled his right ankle in the first quarter
* LG Kingsley Suamataia was kicked in the calf but returned
* WR Jaylen Royals was examined for a concussion but cleared', '2026-10-19T01:06:02.000Z'::timestamptz),
  ('mattderrick', 'And now Chargers WR Ladd McConkey is ruled out with a concussion. Hits keep coming for the Chargers.', '2026-10-18T21:09:19.000Z'::timestamptz),
  ('mattderrick', 'Travis Kelce back on the training table, getting his ankle taped for a second time during the first quarter.', '2026-10-18T20:40:27.000Z'::timestamptz),
  ('mattderrick', 'Williams is rejoining his defensive teammates on the bench.

Travis Kelce on the field to start this drive.

Chiefs are dodging injury issues early today, seemingly. https://t.co/Q2vMdaZUyZ', '2026-10-18T20:37:05.000Z'::timestamptz),
  ('mattderrick', 'Travis Kelce is on the medical table as the KC drive ends. Looks like he is getting his right ankle retaped.

Harrison Butker hits a 44-yard field goal, KC 3, Chargers coming up.', '2026-10-18T20:32:08.000Z'::timestamptz),
  ('levidamien', '#Raiders Week 6 snap counts vs Bills: Changeup at guard, split time at CB, career-high for RB Mike Washington Jr https://t.co/jZENyrUs8F via @TheRaidersWire', '2026-10-19T17:37:37.000Z'::timestamptz),
  ('levidamien', 'Klint Kubiak had succint 2-word reply on report #Raiders discussed sitting RB Ashton Jeanty https://t.co/mZS2BSHQib via @TheRaidersWire', '2026-10-14T18:23:31.000Z'::timestamptz),
  ('levidamien', 'Klint Kubiak''s pointed reason Mike Washington lost snaps to Dylan Laube should send message to #Raiders rookie back https://t.co/blRjxMcgy8 via @TheRaidersWire', '2026-10-12T21:46:15.000Z'::timestamptz),
  ('levidamien', '#Raiders Week 5 snap counts vs #Patriots: Mike Washington falls off cliff https://t.co/w5OeDSEAgW via @TheRaidersWire', '2026-10-12T17:35:54.000Z'::timestamptz),
  ('levidamien', 'Klint Kubiak admits RB Ashton Jeanty ''beat up'', should #Raiders sit him? https://t.co/0lKKUiRxKU via @TheRaidersWire', '2026-10-11T22:17:04.000Z'::timestamptz),
  ('levidamien', 'Ian Rapoport pinpoints new injury to #Raiders RB Ashton Jeanty https://t.co/54RvPA4DeB via @TheRaidersWire', '2026-10-11T16:28:26.000Z'::timestamptz),
  ('davebirkett', 'The Lions placed 3 players on injured reserve today: Tom Kennedy, Ben Bartch and Devin White.', '2026-10-16T20:04:00.000Z'::timestamptz),
  ('davebirkett', 'Dan Campbell said at his news conference today Tom Kennedy needs knee surgery and will miss the rest of the season', '2026-10-12T21:18:06.000Z'::timestamptz),
  ('davebirkett', 'Detroit Lions lose Devin White, Tom Kennedy to injuries https://t.co/c8FxxrTWkl via @freep', '2026-10-12T02:40:47.000Z'::timestamptz),
  ('davebirkett', 'Sam LaPorta on contract talks with the Lions: "I don''t know if it''s truly off the table but I think there''s certainly a stalemate right now" https://t.co/xXfUW8aNlu via @freep', '2026-10-07T21:52:05.000Z'::timestamptz),
  ('joshweinfuss', 'Jared Goff hits Jameson Williams for a 39-yard touchdown.

The Lions go up 31-7 with 9:42 left in the third quarter. 

This is now the fourth straight game that the Cardinals'' defense has given up 30+ points this season and the 10th time since Week 10 of last season.', '2026-10-11T22:25:36.000Z'::timestamptz),
  ('holderstephen', 'Downs drawing two defenders here, again.

Point is, Pierce''s presence would be a game changer for Downs and Warren, too, for that matter. Throw in the fact that Jones is clearly not 100%, and I just don''t like their chances for generating explosiveness. Tough sledding ahead. END https://t.co/ByyhY4pOAo', '2026-10-13T19:06:36.000Z'::timestamptz),
  ('marykaycabot', 'Deshaun Watson orchestrates 4th fourth-quarter game-winning drive of the season to lead the #Browns to 1st place in the #AFCNorth at 4-2 with a 13-10 victory over the #Ravens. Andre Szmyt kicks the GW as time expires ---&gt;  https://t.co/clBpipZ3If', '2026-10-19T01:40:10.000Z'::timestamptz),
  ('adamschefter', 'Colts Week 1 starting QBs under GM Chris Ballard:

🏈2017: Scott Tolzien
🏈2018: Andrew Luck
🏈2019: Jacoby Brissett
🏈2020: Philip Rivers
🏈2021: Carson Wentz
🏈2022: Matt Ryan
🏈2023: Anthony Richardson
🏈2024: Anthony Richardson
🏈2025: Daniel Jones
🏈2026: Daniel Jones https://t.co/9X8ZeqVldz', '2026-10-19T13:58:32.000Z'::timestamptz),
  ('courtneyrcronin', 'FINAL: Bears 31, Falcons 23

Caleb Williams had his 6th career 300-yard passing game, breaking a tie with Mitchell Trubisky for the most such games by a Bears player before turning 25.

Next up: Patriots at home on TNF', '2026-10-18T20:20:01.000Z'::timestamptz),
  ('courtneyrcronin', 'Xavier McKinney again. Tyson Bagent throws an INT over the middle. Pass went behind Colston Loveland. Looked similar to the one he threw targeting Loveland last week when Minkah Fitzpatrick picked him off.', '2026-10-11T19:18:48.000Z'::timestamptz),
  ('robdemovsky', 'Javon Hargrave is down and receiving medical attention.', '2026-10-11T20:00:58.000Z'::timestamptz),
  ('espndirocco', 'Jaguars are lining up Travis Hunter on Nico Collins, or at least on the same side.', '2026-10-18T14:22:16.000Z'::timestamptz),
  ('kat_terrell', 'I also really needed to go to sleep sooo...', '2026-10-13T03:21:06.000Z'::timestamptz),
  ('seifertespn', 'That''s two lost fumbles in the red zone for the Vikings, and this one -- by Myles Price -- get returned 87 yards for a touchdown. A missed PAT means the game is tied at 13, but man...', '2026-10-11T18:59:26.000Z'::timestamptz),
  ('courtneyrcronin', 'Josh Blackwell having a hell of a game on special teams today. Great punt by Tory Taylor to start with.', '2026-10-18T19:13:24.000Z'::timestamptz),
  ('robdemovsky', 'What the second part of that transaction means: https://t.co/CLKdLSbj0q', '2026-10-19T21:22:24.000Z'::timestamptz),
  ('jennalaineespn', 'Rueben Bain Jr. just notched his first career sack. Also had a pass deflection on A''Shawn Robinson''s interception. What a breakthrough for him after a discouraging start to his rookie season that''s included shoulder and groin injuries. He''s kept his head down and worked.', '2026-10-18T18:21:23.000Z'::timestamptz),
  ('bradyhenderson', 'Here was second pick. Third-and-7, game tied in OT. Darnold had Kupp in the flat but said he "just got greedy."

"... I should have just gotten it down to Coop. Cooper ran a really good route right under the sticks and I fee like he would have caught it and got the first down." https://t.co/MiAc59cXJY', '2026-10-16T21:23:45.000Z'::timestamptz),
  ('espndirocco', 'That''s a big stop by the Jaguars defense to at least catch a breather.', '2026-10-18T15:45:47.000Z'::timestamptz),
  ('nwagoner', 'Corliss Waitman doing Corliss Waitman things.', '2026-10-20T02:31:53.000Z'::timestamptz),
  ('marykaycabot', '#Browns Denzel Ward, minority owner of #Guardians still believes they’re going to win it all, tied 1-1 with the #Rays: https://t.co/Dh8K5kpW6s', '2026-10-14T15:36:38.000Z'::timestamptz),
  ('courtneyrcronin', 'Case Keenum is now at quarterback for the Bears', '2026-10-11T19:25:14.000Z'::timestamptz),
  ('jordanraanan', 'The Giants (3-2-1) may not be all that good. But they are hella entertaining!', '2026-10-18T20:29:13.000Z'::timestamptz),
  ('espndirocco', '10 https://t.co/hUJL37gP7l', '2026-10-18T14:55:05.000Z'::timestamptz),
  ('sarahbarshop', 'The Rams are going for two after their first touchdown of the game.', '2026-10-18T20:53:26.000Z'::timestamptz),
  ('mikereiss', 'Other game balls went to the entire offensive line, and TE Hunter Henry, according to players. 

Henry’s 28th TD catch tied Russ Francis for third place among TEs in franchise history. https://t.co/nWBr7CnrML', '2026-10-18T21:04:24.000Z'::timestamptz),
  ('courtneyrcronin', 'Brutal penalty for the Bears, who now have 11 for 118. OPI on Colston Loveland who pushes off with his right arm.', '2026-10-18T19:12:40.000Z'::timestamptz),
  ('sarahbarshop', 'Pre-game baseball on the SoFi Stadium Oculus. https://t.co/gfJVqd8Otq', '2026-10-12T22:46:21.000Z'::timestamptz),
  ('espndirocco', 'Jaguars practice begins at The Grove https://t.co/5fdBCVJwWl', '2026-10-09T13:19:03.000Z'::timestamptz),
  ('jennalaineespn', 'Jalon Daniels became the first UDFA rookie QB in the common draft era to win a game for a winless team. It wasn’t his first road victory in the Lone Star State either. At Kansas, he led the Jayhawks to a 57-56 overtime victory at Texas https://t.co/uid3AFP1sF', '2026-10-09T07:39:12.000Z'::timestamptz),
  ('toddarcher', 'Cowboys open with a Javonte Williams'' TD run from the 1 on their first drive of the second half to cut the Packers lead to 17-7. That''s Williams'' seventh rushing touchdown of the year.', '2026-10-19T02:15:36.000Z'::timestamptz),
  ('tim_mcmanus', 'This week would have largely been about praising Nick Sirianni and the coaching staff for a gutty win amid adverse conditions. 

Then came the fateful decision to kick the ball to Abdullah, flipping the result on its head.', '2026-10-11T17:21:30.000Z'::timestamptz),
  ('davebirkett', 'Today’s gonna be a mailbag day. What Lions questions are on your mind?', '2026-10-15T12:18:19.000Z'::timestamptz),
  ('courtneyrcronin', 'Looked like trainers were cutting off Kendal Daniels'' jersey on the field as they waited for the cart to come out. Not a good scene.', '2026-10-18T19:03:32.000Z'::timestamptz),
  ('seifertespn', 'Will Reichard is now good from 55 yards, to pair with conversions from 54 and 40 yards earlier in the game, to give the Vikings a 2-score lead. He''s now 15-for-15 on the season, including 5-for-5 from 50+. 

Vikings 23, Saints 13. 7:01 Q4.', '2026-10-11T19:33:37.000Z'::timestamptz),
  ('seifertespn', 'Rare case where Kevin O''Connell doesn''t have the timeouts he needs in the 2-minute drill. Vikings have to spike at the 36, and are fortunate (as usual) they have Will Reichard. Good from 54. They haven''t scored a TD in their last 8 quarters. 

Saints 7, Vikings 6. HALF.', '2026-10-11T18:19:13.000Z'::timestamptz),
  ('marykaycabot', '#Browns Deshaun Watson on being a 4th quarter gamer and bringing joy to Huntington Bank Field: https://t.co/lmAzHWoLFX', '2026-10-18T20:55:02.000Z'::timestamptz),
  ('courtneyrcronin', 'Strong endorsement from Tom Brady, who just said on the broadcast that he believes this is the best game Caleb Williams played as a pro.', '2026-10-18T20:18:46.000Z'::timestamptz),
  ('jennalaineespn', 'This is who Baker is. This is who Jalon is. https://t.co/GriUhzIH8a', '2026-10-09T23:22:52.000Z'::timestamptz),
  ('courtneyrcronin', 'The Bears didn’t have much by way of a downfield passing game until Caleb Williams’ return. 

Williams was 5-for-6 for 100 yards (16.7 ypa) and a touchdown on passes thrown 10+ air yards vs. Atlanta. 

In Williams’ absence Weeks 3-5, Bears QBs were 18-34 (10.9 ypa) with 1 TD and 3 INTs on those same throws.', '2026-10-19T04:37:51.000Z'::timestamptz),
  ('sarahbarshop', 'Bradley Chubb on what he said to Alaric Jackson before the postgame incident:

“I said: ''We''re gonna see y''all''s ass again. And when we see you again, all that chipping ain''t gonna save you.’”

More from @nicksuss: https://t.co/gX359mkP8U', '2026-10-14T23:35:57.000Z'::timestamptz),
  ('holderstephen', 'Jones needs a solid team around him that he can help get to the finish line. Here, he is being asked to do more than that. And I don’t see him as a guy who can truly lift his team.', '2026-10-19T01:54:33.000Z'::timestamptz),
  ('josephperson', 'Said all looked pretty good, but noted football shape is different than regular shape. https://t.co/4x15GcSBta', '2026-10-13T19:44:37.000Z'::timestamptz),
  ('mikereiss', 'Mike Vrabel arrives, takes note a camera close by that isn’t usually there (for Amazon Prime pre-game show), and asks, “What do you got, Karen?” https://t.co/kWxDhjj5vO', '2026-10-19T15:31:35.000Z'::timestamptz),
  ('holderstephen', 'Jonathan Taylor''s 38-yard reception on that screen play was his longest play of the season.', '2026-10-18T17:42:26.000Z'::timestamptz),
  ('sarahbarshop', 'Since last season, the Rams have a 66% touchdown rate in the red zone in 20 games with Davante Adams and a 46% rate (6 touchdowns on 13 red-zone drives) in three games without him.

According to ESPN Research, 46% ranks 31st in the NFL over that span while 66% is tied for fourth.', '2026-10-19T23:17:32.000Z'::timestamptz),
  ('espndirocco', 'Parker Washington and Brian Thomas Jr. collided on their routes.', '2026-10-11T14:36:37.000Z'::timestamptz),
  ('seifertespn', 'Kyler Murray is growing more comfortable before our eyes. QBR by week this season:

W1: 2.7 (11 plays)
W2: DNP
W3: 23.6
W4: 34.0
W5: 78.5', '2026-10-12T16:47:45.000Z'::timestamptz),
  ('joshweinfuss', 'Arizona''s defense holds again and force the Rams into a 44-yard field goal.  

Rams 3, Cardinals 0. 9:41 left in the first quarter.', '2026-10-18T20:15:09.000Z'::timestamptz),
  ('sarahbarshop', 'Aaron Donald has played 19 defensive snaps (79.2%) so far and has two QB pressures and two tackles.', '2026-10-13T02:07:09.000Z'::timestamptz),
  ('bynatetaylor', 'Couldn''t tell anything from rewatching the Chiefs'' touchdown drive. Sometimes the spotter see something and ask for the player to evaluated. Sometimes a player self reports or someone on the sideline reports a concern. https://t.co/nmF3S5r7D9', '2026-10-18T21:56:22.000Z'::timestamptz),
  ('jamisonhensley', 'Final: Browns 13, Ravens 10

Baltimore falls to 4-2 because it failed to hold another double-digit lead.

The Ravens didn''t score after the first quarter, and Tyler Huntley was 13-of-24 for 107 yards in the final three quarters.

Next up, Ravens host the Bengals, who are coming off a bye.

The Ravens desperately need Lamar Jackson to return from an ankle injury.', '2026-10-18T19:57:15.000Z'::timestamptz),
  ('espndirocco', '“We consider him an elite wide receiver. I don''t know what everybody else thinks, but we feel like he''s pretty freaking good."

 https://t.co/AXKpNMQycf', '2026-10-14T11:54:03.000Z'::timestamptz),
  ('seifertespn', 'Vikings have almost double the time of possession as the Saints. Should bode well for the 4th quarter if they can avoid any more of these mistakes.', '2026-10-11T19:07:51.000Z'::timestamptz),
  ('bynatetaylor', 'Always fantastic to see friends before kickoff. https://t.co/zPBpEal9CV', '2026-10-18T19:50:10.000Z'::timestamptz),
  ('toddarcher', 'Cowboys win the toss and will ... receive.', '2026-10-19T00:20:57.000Z'::timestamptz),
  ('jamisonhensley', 'Many of the Ravens players have talked about how offensive coordinator Declan Doyle is an innovator.

Case in point: TE Josh Cuevas runs a route after lining up in the left guard spot.  https://t.co/imGJrvuuRG', '2026-10-18T17:59:57.000Z'::timestamptz),
  ('kat_terrell', 'All is calm..at the moment https://t.co/VpDTgZ7jeu', '2026-10-11T19:05:01.000Z'::timestamptz),
  ('espndirocco', 'Coverage mistake and an easy TD for the Texans. Foster Moreau wide open in the middle of the field.', '2026-10-18T13:59:31.000Z'::timestamptz),
  ('sarahbarshop', 'PUNTER Ethan Evans'' extra point is good and the Rams lead 16-15 with 47 seconds to go.', '2026-10-18T22:53:31.000Z'::timestamptz),
  ('courtneyrcronin', 'Kyler Gordon blitzes off the edge and sacks Michael Penix Jr. QB didn''t see it coming. 6 yard loss.', '2026-10-18T18:53:43.000Z'::timestamptz),
  ('sarahbarshop', 'That was the fourth-longest kickoff return in the NFL this season, according to ESPN Research.', '2026-10-13T00:17:18.000Z'::timestamptz),
  ('courtneyrcronin', 'Tough scene as Kendal Daniels gets carted off the field. Fans cheer in support but he was not moving as he was taken back to the locker room and likely straight to the hospital.', '2026-10-18T19:08:12.000Z'::timestamptz),
  ('tdavenport_nfl', '#Titans Cam Ward praised the OLine for keeping him clean. He admitted he needs to win the 1v1 with a free rusher. Ward also spoke on the deep game getting better. https://t.co/qy7u2BOzJz', '2026-10-14T16:50:25.000Z'::timestamptz),
  ('jamisonhensley', 'The Ravens are 4.5-point favorites for Sunday’s game at the Browns, per @DraftKings.

This marks the 15th time that Baltimore has been favored in the last 18 games in Cleveland.

When favored in Cleveland, the Ravens are 11-3 (.785) outright since 2009. Baltimore’s average margin of victory in Cleveland during this span is 11.5 points.', '2026-10-13T17:58:23.000Z'::timestamptz),
  ('richcimini', 'Jets notable snap counts:

WR: Wilson 61, Patrick 61, Williams 39, McClain 2: Patrick goes from IR to starting role (until Mitchell returns).

TE: Taylor 38, Woods 24, Ruckert 23, Sadiq 13: Woods leapfrogs Ruckert.

ED: Bailey 54, Enagbare 51, McDonald 27, Ossai 20: Ossai left with ankle injury. Edge rotation stretched thin.

#Jets', '2026-10-12T12:57:23.000Z'::timestamptz),
  ('robdemovsky', 'The Packers kept it about themselves all week. But when they trounced the Bears, a couple guys fired back.

The story from Sunday’s much-needed win: 
 https://t.co/pmrykLx4ay', '2026-10-12T12:47:52.000Z'::timestamptz),
  ('mikereiss', 'NE 26, NY 19

🌥️Win without top performance

⬆️ Henry, Kiner, Wishnowsky

⬇️ A.J. Brown

⏱️5.61 seconds to throw on 1st TD

🧈🖐️A.J. Brown - career-high 3 drops

🚑 Ben Brown (knee), Doubs (shoulder), Moses (ankle), Vera-Tucker (hamstring)

⭐️4th down D

⏭️🐻 Next: at Bears (Thu)', '2026-10-18T20:11:20.000Z'::timestamptz),
  ('joshweinfuss', 'This x a million. 

And figure out third down. https://t.co/TVPj5zmT6y', '2026-10-18T01:39:16.000Z'::timestamptz),
  ('nwagoner', 'Seattle calls timeout before this fourth-and-10 play. It has one left which means if #49ers can get a stop, this one is over.', '2026-10-11T23:38:18.000Z'::timestamptz),
  ('mattderrick', 'The things Kenneth Walker can do with the football in his hands ... he''s different than Jamaal Charles or Priest Holmes, but just as special.

How did Seattle have him for four years and not realize this was within him?', '2026-10-18T21:39:51.000Z'::timestamptz),
  ('nwagoner', 'Over the past two weeks, Waitman has punted nine times. Six of those have been downed inside the 20 with three of those inside the 10. None of those have been returned. 

His 47.9 net punting average is 4th in the NFL over those two weeks. 

Kyle Shanahan on Waitman: 

"He was unbelievable two weeks in a row. I thought he was huge last week versus Denver, and I thought he was huge this week. We had to play the field position game a ton, and he''s probably another guy we could have given the game ball to."', '2026-10-12T20:24:16.000Z'::timestamptz),
  ('kat_terrell', 'All we can control moving forward as far as playing better, coaching better, giving ourselves the opportunities moving forward. I think our guys have the right mindset against the NFL. There''s ups and there''s downs and it''s about navigating those &amp; getting better moving forward."', '2026-10-14T22:14:07.000Z'::timestamptz),
  ('joshweinfuss', 'The Cardinals get yet another field goal. 

Arizona 15, LA 9. 9:28 left in the game.', '2026-10-18T22:15:31.000Z'::timestamptz),
  ('jordanraanan', 'J.J. McCarthy''s first drive ends with ... an interception.', '2026-10-18T19:43:45.000Z'::timestamptz),
  ('jamisonhensley', 'Jesse Minter said Derrick Henry addressed the fumble in the locker room.

“Nobody works harder at ball security,” Minter said. https://t.co/HOcKmLnSkV', '2026-10-18T20:07:51.000Z'::timestamptz),
  ('jordanraanan', 'Great throw from J.J. McCarthy to Malik Nabers for a 46-yard gain. Giants in business again.', '2026-10-18T20:09:01.000Z'::timestamptz),
  ('espndirocco', 'Cam Little from 60 .... 31-31 with 1:55 to play', '2026-10-18T16:38:08.000Z'::timestamptz),
  ('seifertespn', 'That was vintage Kyler Murray - literally. His 7 scrambles today were his most in a game since 2020 per ESPN Research.', '2026-10-11T20:03:53.000Z'::timestamptz),
  ('joshweinfuss', 'The Cardinals get a stop on fourth down and take over possession on their own 27.', '2026-10-18T22:01:13.000Z'::timestamptz),
  ('robdemovsky', 'Love picked off, returned for a TD.

MarShawn Lloyd and Sean Rhyan both injured on the play.', '2026-10-19T00:54:08.000Z'::timestamptz),
  ('richcimini', 'Quote from Tim Patrick, who was asked about the ceiling of the Jets'' offense when injured players return:

"We could be the best, honestly. We could be the best. We have so much talent, it''s insane. ... I''ve never been around this much talent, so I don''t even know how to answer that question. It''s going to be scary because it''s just so many different ways we could win."

Reminded that he played on the ''24 Lions (Goff, Gibbs, St. Brown, Williams, LaPorta), Patrick replied:

"I feel like the tight-end room here is what separates from that offense. It''s a little bit more deeper, I would say. ... Obviously, Sam LaPorta is great. Brock (Wright) is great, but from top to bottom, we dress five tight ends every week. Not every team in the NFL can do that, and any one of those guys could be the guy. And we have freaking Sadiq -- he runs 4.3 and he''s not from this planet. So it''s just one of those things where it''s like our tight-end room is going to make us the offense that we''re going to be."

#Jets', '2026-10-12T16:01:31.000Z'::timestamptz),
  ('kat_terrell', 'Martin Emerson with another INT', '2026-10-18T19:43:33.000Z'::timestamptz),
  ('nwagoner', 'Not sure the in game scoreboard operators are in touch with what''s happening at the moment. 

Niners working in the red zone and there was a "Get Loud" graphic plastered on the big board. Odd.', '2026-10-20T00:35:28.000Z'::timestamptz),
  ('josephperson', 'It’s like @jonmachota’s videos of the Cowboys opening the doors at AT&amp;T Stadium. https://t.co/klwYNOk8t6', '2026-10-14T13:40:23.000Z'::timestamptz),
  ('tdavenport_nfl', 'Robert Saleh on Anthony Hill Jr''s TFL in the 2nd half sparking the #Titans and Jeffery Simmons inspiring halftime actions. He called Simmons the best DT in football. https://t.co/xj7sfiqO1H', '2026-10-18T20:27:45.000Z'::timestamptz),
  ('davebirkett', 'Dan Campbell with a game ball for Lions play by play announcer Dan Miller after the game today. Campbell choked back tears as he announced the game ball to Miller, who lost his wife to cancer this week. Prayers to Dan and his family.', '2026-10-12T00:37:02.000Z'::timestamptz),
  ('bynatetaylor', 'This is an awesome question. I think part of the reason is folks don''t have to rush as much in the morning, they are more prepared. This time of the year is also perfect for a great tailgate.

Primetime games can be incredible for Sunday night. It gets a little tricky on Monday. https://t.co/tSHqqNCj79', '2026-10-18T19:49:14.000Z'::timestamptz),
  ('robdemovsky', 'Brandon Cisse comes off holding his right arm/shoulder. Carrington Valentine in.', '2026-10-19T03:14:27.000Z'::timestamptz),
  ('levidamien', 'No QB in 2026 has had a better performance than Drake Maye just did vs #Raiders https://t.co/Uqg74ljZ41 via @TheRaidersWire', '2026-10-12T18:48:47.000Z'::timestamptz),
  ('holderstephen', 'I feel like this is a very worthy performance by Daniel Jones so far. Much better under pressure, more confident in the pocket, protecting the ball. 

The Colts have two issues today: Can''t run the ball and garbage tackling.', '2026-10-11T19:06:21.000Z'::timestamptz),
  ('kat_terrell', 'Martin Emerson broke up a pass in the end zone earlier and Quincy Riley collided with him in the ensuing celebration. Emerson was clutching his side on the sideline and still looks like he''s in pain sitting on the bench.', '2026-10-18T19:54:54.000Z'::timestamptz),
  ('holderstephen', 'I like how they drew this up. Got Downs isolated on the safety and, presto, big play. https://t.co/4N1NsPzkDs', '2026-10-13T19:06:35.000Z'::timestamptz),
  ('richcimini', 'There’s a good vibe around the Jets, and now they have an opportunity to build on a W and make a statement in the AFC East.

Wilson: “Big-ass game.”
Brownlee: “It means the world.” #Jets https://t.co/xsOPEP2uVl', '2026-10-15T14:24:50.000Z'::timestamptz),
  ('mikereiss', 'Defensive snaps vs. Jets:

🏈 OLB Elijah Ponder (48, sack) up to 74.7% on year

🏈 DT Milton Williams ties season high (46), now 70% for season 

🏈 CB Charles Woods fills in again (40 of 62, INT, game ball); 51.1% on year

🏈 3-CB nickel plan, relies on lighter box to stop run https://t.co/WYZIQ0WJsu', '2026-10-19T09:40:04.000Z'::timestamptz),
  ('bradyhenderson', 'On both of his interceptions last night, Sam Danold bypassed an open Cooper Kupp. Here was the first one. Third-and-1, down three, 1:31 left in regulation. He said he thought the DB may have been "driving it." If so, it''s a pick-six waiting to happen. But there was enough space. https://t.co/VvXL7gtY2O', '2026-10-16T21:08:20.000Z'::timestamptz),
  ('courtneyrcronin', 'Dayo Odeyingbo just went back to the locker room', '2026-10-11T18:46:19.000Z'::timestamptz),
  ('sarahbarshop', 'Sean McVay was asked about the play call on third and five before the blocked field goal.

“Yeah, I wish I would have had a better play call and gone for it, gotten it a lot tighter. I''m sick right now with myself.”', '2026-10-13T04:44:41.000Z'::timestamptz),
  ('seifertespn', 'Justin Jefferson on the TD pass from Kyler Murray into triple coverage: "Definitely wasn''t the most open, but it was a great throw. I mean, there was nothing else that I could do besides just put my hands up and make the grab. That throw was tremendous."', '2026-10-11T21:26:38.000Z'::timestamptz),
  ('mikegarafolo', 'So much good injury news on the timeline today, with a bunch of practice windows eligible to be opened and other players coming back from short-term injuries. A nice change from feeling like half the league was headed to IR a few weeks ago. https://t.co/M0gRUPTuod', '2026-10-14T17:34:02.000Z'::timestamptz),
  ('kat_terrell', 'Martin Emerson almost had a 3rd INT there.', '2026-10-18T19:59:23.000Z'::timestamptz),
  ('kat_terrell', 'That was one of the more embarrassing missed tackles I''ve seen..', '2026-10-18T19:15:34.000Z'::timestamptz),
  ('tdavenport_nfl', 'Here''s a good example of how the #Titans John Franklin-Myers and Jeffery Simmons rush tandem can thrive. Simmons slashes inside taking two OL, giving JFM the 1v1 and he wins by bull rushing the tackle into Daniel Jones forcing him to step up in the pocket and Simmons cleans it up.', '2026-10-19T14:01:21.000Z'::timestamptz),
  ('mikegarafolo', 'Another OT-drive-killing forced fumble. Nate Landman is today’s Daron Payne.  https://t.co/aZ6NcYQ2zd', '2026-10-13T03:31:51.000Z'::timestamptz),
  ('seifertespn', 'Saints have run only 33 offensive plays in this game and held the ball for 16:57. Just total domination by the Vikings defense.', '2026-10-11T19:18:09.000Z'::timestamptz),
  ('nwagoner', '#49ers had a strong overall pass rushing performance on Sunday. 

Combined for 5 sacks, 15 pressures, 8 QB hits 

Keion White led the way with 4 pressures and a sack. 

Romello Height had a 40% win rate and was credited with 2 incompletions created and an INT created.', '2026-10-12T05:19:57.000Z'::timestamptz),
  ('courtneyrcronin', 'Keenum throws an interception at the goal line.', '2026-10-11T19:29:31.000Z'::timestamptz),
  ('espndirocco', 'Jakobi Meyers and Quintin Morris with good blocks on Bhayshul Tuten''s TD catch-and-run. Meyers'' block on the perimeter secured the first down at least.', '2026-10-18T14:34:24.000Z'::timestamptz),
  ('josephperson', 'Just in case anyone needs a reminder about the seriousness of a blood clot traveling to a lung: Panthers OT Taylor Moton returned last week after three months on blood thinners.
https://t.co/h4WdyXqgU2 https://t.co/ga7BAuDKlY', '2026-10-19T15:17:26.000Z'::timestamptz),
  ('richcimini', 'FINAL: Patriots 26, Jets 19

Same as it ever was. Jets show fight, but not good enough.

0-7 in the division under Glenn.

Offense should be better than this. Poor at situational football. Lousy in plus territory.

Garrett Wilson - only 2 targets thru first 3 quarters. Inexcusable.

Geno Smith, a bad time for his first pick.

Where was the pass rush? Zero sacks vs patchwork line. Blitzes backfired.

Omar Cooper Jr impressive re-debut.

Jets need to beat Miami and Vegas or else it’s draft watch. #Jets', '2026-10-18T20:15:24.000Z'::timestamptz),
  ('courtneyrcronin', 'What are you even talking about? This is exhausting.  

If fans don’t get the answer they want from a coach/player/GM/etc., then it’s “the media’s fault” for not asking hard enough questions, even if those questions have been asked and, in certain instances, dodged (go listen to some of the coordinator pressers today). 

If a reporter provides tangible proof of why something was perceived a certain way, like the example I pointed out below to how Caleb Williams’ hamstring was spoken about by the team, then I’m “entitled” and how dare I point out what the head coach said VERBATIM because I’m ego tripping?  

Damned if you do, damned if you don’t in this profession. It’s our job to provide context, clarity and ask questions to inform. That isn’t a “new normal.” That’s how the job is done.', '2026-10-16T01:41:37.000Z'::timestamptz),
  ('courtneyrcronin', 'Entire Atlanta bench has emptied on the field as trainers are efforting getting Kendal Daniels on the cart. Bears players are telling fans chanting “Green Bay sucks” to stop doing that. https://t.co/SSPfNAebPg', '2026-10-18T19:05:38.000Z'::timestamptz),
  ('joshweinfuss', 'Jacoby Brissett gets picked off by Rams S Quentin Lake, giving the Rams prime field position at the Cardinals 32.', '2026-10-18T20:11:12.000Z'::timestamptz),
  ('seifertespn', 'As it is, it''s an 11-yard loss on first down. We''ve seen that play before in Minnesota. Has it ever worked? Lots of moving parts and, in this case, exposed the QB to unnecessary risk. https://t.co/4UWXnHMWfE', '2026-10-11T19:29:22.000Z'::timestamptz),
  ('nwagoner', 'Osa Odighizuwa gets the sack on third down to force a punt. Another good rush design by Raheem Morris had Romello Height coming off Osa''s outside shoulder, forced Washington blockers into conflict and OO gets home.', '2026-10-20T00:49:01.000Z'::timestamptz),
  ('josephperson', 'Jaelan Phillips was with the Eagles last year. But the loudest he’s ever been booed was when he was playing at Philly with the Dolphins, sacked Jalen Hurts in 2023 and celebrated with a Fly Eagles Fly gesture. https://t.co/YlFH0muhFU', '2026-10-15T19:59:55.000Z'::timestamptz),
  ('marcraimondi', 'Stefanski: Those are no fun for anybody. Players, coaches. You don''t want to see anyone down like that. kendal is a kid we all love, we all respect. #Falcons', '2026-10-18T20:44:48.000Z'::timestamptz),
  ('kat_terrell', 'Carlson''s 51-yard field goal is good', '2026-10-18T19:22:22.000Z'::timestamptz),
  ('ben_baby', 'That was Samaje Perine''s first receiving TD since 2024, when he was with Kansas City. 

First for the Bengals since 2022.', '2026-10-11T17:57:00.000Z'::timestamptz),
  ('nwagoner', '#49ers young defenders growing up in a big way in a big game today:

DT Gracen Halton - 3 tackles, 2 TFL, 1 sack, 1 FF, 1 FR, 1 TD
LB Jaden Dugger - 9 tackles, 1 sack
DT Sebastian Valdez - 3 tackles, 1 sack
CB Renardo Green - 1 tackle, 2 INT, 3 passes defended

DE Romello Height also consistently created pressure.', '2026-10-11T23:54:53.000Z'::timestamptz),
  ('kat_terrell', 'Shough on Gayle Benson: "She wasn''t saying anything that wasn''t already known and she did a really good job of highlighting the expectations and we have those same expectations for ourselves. But more than anything, it just starts with us with one rep, one practice."', '2026-10-14T22:23:14.000Z'::timestamptz),
  ('holderstephen', 'Welcome to Pittsburgh, where it has been raining all night and will continue raining throughout the day for Colts at Steelers. Added bonus: Pitt played a game on the same turf just yesterday. Yay. https://t.co/e3zJ1CS8nY', '2026-10-11T13:11:24.000Z'::timestamptz),
  ('tdavenport_nfl', 'Tony Pollard on coping with all the losing https://t.co/kTnqEbUzpR', '2026-10-15T17:05:16.000Z'::timestamptz),
  ('espndirocco', 'Eagles have converted 4 of 6 third downs, none bigger than the 62-yard TD pass to WR Darius Cooper.', '2026-10-11T14:44:20.000Z'::timestamptz)
) as v(handle, text, posted_at)
where r.handle = v.handle and r.text = v.text and r.posted_at is null;
