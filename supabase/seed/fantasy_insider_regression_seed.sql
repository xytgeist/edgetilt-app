-- Known-answer insider posts for the fantasy-insider-poll regression run (seeded 2026-10-20 from the hand-checked
-- validation set: trusted would-push posts with the two "coming off IR" misreads corrected, plus game / chatter /
-- analysis posts that must never set a status). Apply after 20261020090000_fantasy_insider_grading.sql.
insert into public.fantasy_insider_regression (handle, text, expected_next, expected_player, origin, note) values
  ('ben_baby', 'Bengals officially place TE Tanner Hudson on injured reserve. Expected to miss the rest of the season with a torn pectoral.', 'ir', 'Tanner Hudson', 'seed-validated', 'hand-checked 2026-10-20'),
  ('ben_baby', 'Bengals will not have WR Colbie Young today. He is inactive.

Full list of inactives: S Kyle Dugger, C Connor Lew, OT Myles Hinton, TE Jack Endries, WR Colbie Young, DT Landon Robinson.', 'out', 'Colbie Young', 'seed-validated', 'hand-checked 2026-10-20'),
  ('holderstephen', 'Colts Tight end Tyler Warren is OUT with a groin injury today.', 'out', 'Tyler Warren', 'seed-validated', 'hand-checked 2026-10-20'),
  ('jamisonhensley', 'An enthusiastic Ja’Kobi Lane is back on the practice field, which starts window to return off IR. The rookie wide receiver injured his wrist in the season opener on Sept. 13.  https://t.co/kseail4OC2', 'none', null, 'seed-validated', 'return window, not IR (fixed misread)'),
  ('jennalaineespn', 'Chase McLaughlin was added to the injury report yesterday with a right groin/hip injury, but coach Todd Bowles said “he’ll be fine.” He also said Baker Mayfield, Antoine Winfield, Jr., Benjamin Morrison and SirVocea Dennis will be out against the Cowboys.', 'out', 'Baker Mayfield', 'seed-validated', 'hand-checked 2026-10-20'),
  ('jordanraanan', 'WR Braxton Berrios had successful surgery on Friday to repair a lisfranc injury, per sources. He is out for the season and was placed on injured reserve last week. https://t.co/U1uLv1IV9M', 'ir', 'Braxton Berrios', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikereiss', 'News story: WR Romeo Doubs (shoulder) placed on IR, won''t return until after the bye week at the earliest.

https://t.co/zeYg42SOhL', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikereiss', 'Patriots transactions:

🏈 Placed on IR: WR Romeo Doubs (shoulder)

🏈 Signed from practice squad to 53-man roster: S Elliott Davison

🏈 Signed to practice squad: WR Ryan Miller, C/G Andrew Rupcich, C Jacob Rizy

🏈 Released from practice squad: CB D’Shawn Jamison', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('nwagoner', '#49ers WR Mike Evans (Achilles) has been ruled OUT.', 'out', 'Mike Evans', 'seed-validated', 'hand-checked 2026-10-20'),
  ('nwagoner', 'NEWS: #49ers WR Deebo Samuel going to miss some time with hamstring injury. Also includes updates from Kyle Shanahan on Nick Bosa, Kyle Juszczyk, Garret Wallow, James Thompson Jr. and Nick Martin...

https://t.co/7zeeuWHwzM', 'out', 'Deebo Samuel', 'seed-validated', 'hand-checked 2026-10-20'),
  ('nwagoner', '#49ers WR Deebo Samuel is “going to miss some time” with a hamstring injury that coach Kyle Shanahan said he “got pretty good.”

LB Garret Wallow also has a hamstring issue that will keep him out a bit.', 'out', 'Deebo Samuel', 'seed-validated', 'hand-checked 2026-10-20'),
  ('sarahbarshop', 'A full list of injuries from Sean McVay:

-- WR Davante Adams (ruptured semitendinosus) out 6-10 weeks
-- NT Poona Ford (ruptured triceps) out for season
-- DE Kobie Turner (groin strain) out for “a handful of weeks)
-- K Blake Grupe (torn ACL) out for season', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('sarahbarshop', 'A long list of injuries from Sean McVay.

Davante Adams is out for 6-10 weeks and Poona Ford is out for the season.', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tim_mcmanus', 'Eagles RB Carson Steele (shoulder) has been ruled out', 'out', 'Carson Steele', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tim_mcmanus', 'Eagles inactives:

Saquon Barkley
Jalyx Hunt
Michael Carter II
A.J. Epenesa
Hollywood Brown
Joe Milton', 'out', 'Saquon Barkley', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tim_mcmanus', 'Eagles announce that the following players have been ruled out of tomorrow''s game against Carolina: 

G Landon Dickerson (knee)

CB Jakorian Bennett (knee)

TE Grant Calcaterra (back)

 TE Eli Stowers (quad)', 'out', 'Grant Calcaterra', 'seed-validated', 'hand-checked 2026-10-20'),
  ('toddarcher', 'KaVontae Turpin has been ruled out with a rib injury.', 'out', 'KaVontae Turpin', 'seed-validated', 'hand-checked 2026-10-20'),
  ('aaronwilson_nfl', '#Texans rule out Tank Dell, David Montgomery and Jalen Pitre and won''t travel to London for #Jaguars game', 'out', 'Tank Dell', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'Commanders officially ruled out WR Terry McLaurin due to a knee injury.', 'out', 'Terry McLaurin', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'More about the Rams suffering multiple significant injuries, including to WR Davante Adams, who now is out 6-10 weeks:

https://t.co/7MnuT5bUC4', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'Rams HC Sean McVay told reporters that WR Davante Adams ruptured his hamstring and now will be sidelined 6-10 weeks.', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'Commanders placed RB Jacory Croskey-Merritt on injured reserve due to his groin injury.', 'ir', 'Jacory Croskey-Merritt', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'Patriots officially placed WR Romeo Doubs on injured reserve.', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('adamschefter', 'Trey Amos, Jordan Magee and Jeremy McNichols are all coming off injured reserve for tonight’s game against San Francisco.

Stefon Diggs also trending towards playing tonight.', 'cleared', 'Jeremy McNichols', 'seed-validated', 'activation (fixed misread)'),
  ('adamschefter', 'Jalen Hurts will be out for the season after doctors discovered multiple blood clots in his lungs. https://t.co/PYfJpO16FS', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('caplannfl', 'Mack Hollins to IR ... https://t.co/2SesSZQyK7', 'ir', 'Mack Hollins', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikegarafolo', 'Some terrible #Rams injury news from Sean McVay today: 

WR Davante Adams (hamstring) out 6-10 weeks
DT Kobie Turner (groin) headed to IR
K Blake Grupe (knee) out for the season https://t.co/SfMU8uq8xt', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikegarafolo', 'The #49ers ruled out WR Christian Kirk for tonight and elevated WR Malik Turner and LB Jalen Graham from the practice squad.', 'out', 'Christian Kirk', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikegarafolo', '#Eagles have now ruled out Carson Steele with a shoulder injury. https://t.co/3IUdfW1xv0', 'out', 'Carson Steele', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikegarafolo', 'DJ Moore and Ed Oliver inactive for the #Bills once again. https://t.co/a1UOyr19fD', 'out', 'DJ Moore', 'seed-validated', 'hand-checked 2026-10-20'),
  ('mikegarafolo', '#Lions returner Tom Kennedy suffered a significant MCL injury that is expected to require surgery and will end his season, sources tell me and @RapSheet. HC Dan Campbell was hopeful Kennedy’s absence would be shorter but further testing revealed the extent of the damage. https://t.co/qhZfMKlGpI', 'out', 'Tom Kennedy', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', '#Commanders WR Terry McLaurin has already been ruled out with a knee injury. https://t.co/jNkvQoFAlM', 'out', 'Terry McLaurin', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'Here is our full story on the #Rams and their slew of injuries — notably Davante Adams headed to IR: https://t.co/tt45Pkt81D

https://t.co/tt45Pkt81D', 'ir', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'Bad to worse: #Rams star WR Davante Adams, who sustained a hamstring injury in last night’s loss to the #AZCardinals, is out 6-10 weeks. https://t.co/FO80VAb5NM', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'The #Patriots placed WR Romeo Doubs on injured reserve with a shoulder injury and signed DB Elliott Davison to the 53-man roster from the practice squad.', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'Good news: The #Commanders have activated CB Trey Amos from IR, as well as LB Jordan Magee and RB Jeremy McNichols

Bad news: RB Jacory Croskey-Merritt Is headed to IR with a groin injury.', 'ir', 'Jacory Croskey-Merritt', 'seed-validated', 'mixed activation + IR post (known miss)'),
  ('rapsheet', 'Here is the full story on #Eagles QB Jalen Hurts, whose season is expected to be over as he undergoes treatment for blood clots: https://t.co/wjsi7R9Nxs

https://t.co/wjsi7R9Nxs', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', '#Eagles QB Jalen Hurts, who is out for the season after several blood clots were revealed in his lungs, has been undergoing tests for days.

Before the London game, Hurts was in the hospital until 4 am and did not sleep because sleep was a risk. He played without having slept. https://t.co/avMUeBBOua', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'This statement details why there was such a dramatic change in the diagnosis for Jalen Hurts. When doctors found multiple blood clots in his lungs, it went from being able to manage it to immediate treatment.

Hurts is out for the season. https://t.co/5rYLhTYGuF', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('rapsheet', 'Jalen Hurts will be out an estimated three months as he undergoes treatment. https://t.co/riJ68k5Q8H', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tompelissero', 'The Patriots placed WR Romeo Doubs on injured reserve.', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tompelissero', 'Eagles QB Jalen Hurts is expected to be sidelined for multiple months after new imaging over the weekend found several blood clots in his lungs. 

Hurts is now on blood thinners and should have no long-term effects. But it’s unlikely he plays again this season. https://t.co/iLhCBu0Isa', 'out', 'Jalen Hurts', 'seed-validated', 'hand-checked 2026-10-20'),
  ('tompelissero', 'Bucs QB Baker Mayfield will miss a third consecutive game since dislocating his thumb in Week 3. But there’s optimism he’ll return next week — just in time for Tampa Bay’s first division game of the season at Carolina.

More in The Sweep: https://t.co/hVvUAJDNjT https://t.co/HwpFcNzTQY', 'out', 'Baker Mayfield', 'seed-validated', 'hand-checked 2026-10-20'),
  ('underdognfl', 'Rams injuries from Week 6:

DT Kobie Turner - IR
DT Poona Ford - Out for season
WR Davante Adams - 6-10 Weeks
K Blake Grupe - IR', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('underdognfl', 'McVay: Davante Adams (knee) will miss 6-10 weeks.', 'out', 'Davante Adams', 'seed-validated', 'hand-checked 2026-10-20'),
  ('underdognfl', 'Christian Kirk (calf) ruled out for Week 6.', 'out', 'Christian Kirk', 'seed-validated', 'hand-checked 2026-10-20'),
  ('underdognfl', 'Romeo Doubs (shoulder) placed on IR; will miss at least 4 games, per @DougKyed.', 'ir', 'Romeo Doubs', 'seed-validated', 'hand-checked 2026-10-20'),
  ('bynatetaylor', 'New story. Rashee Rice is out against the Chargers with hamstring injury. Andy Reid suggested it''s possible Rice could be available next week when the Chiefs play the Seahawks.

"He''s a pretty fast healer."
https://t.co/cXL0Ee4T6R', 'out', 'Rashee Rice', 'seed-validated', 'hand-checked 2026-10-20'),
  ('bynatetaylor', 'Andy Reid said Rashee Rice (right hamstring) &amp; Josh Simmons (bulging disc in lower back) are both out for Sunday''s game against the Chargers.', 'out', 'Rashee Rice', 'seed-validated', 'hand-checked 2026-10-20'),
  ('bynatetaylor', 'Andy Reid, following the Chiefs'' bye, said the team signed Justin Watson to the practice squad. Tyquan Thornton (left ankle) is expected to be placed on IR.

Reid on Josh Simmons: "Josh was here all [last] week doing his rehab. They''ll be back tomorrow &amp; I''ll have a better idea."', 'ir', 'Tyquan Thornton', 'seed-validated', 'hand-checked 2026-10-20'),
  ('davebirkett', 'The Lions placed 3 players on injured reserve today: Tom Kennedy, Ben Bartch and Devin White.', 'ir', 'Tom Kennedy', 'seed-validated', 'hand-checked 2026-10-20'),
  ('davebirkett', 'Dan Campbell said at his news conference today Tom Kennedy needs knee surgery and will miss the rest of the season', 'out', 'Tom Kennedy', 'seed-validated', 'hand-checked 2026-10-20'),
  ('joshweinfuss', 'Jared Goff hits Jameson Williams for a 39-yard touchdown.

The Lions go up 31-7 with 9:42 left in the third quarter. 

This is now the fourth straight game that the Cardinals'' defense has given up 30+ points this season and the 10th time since Week 10 of last season.', 'none', null, 'seed-negative', 'sample label game'),
  ('holderstephen', 'Downs drawing two defenders here, again.

Point is, Pierce''s presence would be a game changer for Downs and Warren, too, for that matter. Throw in the fact that Jones is clearly not 100%, and I just don''t like their chances for generating explosiveness. Tough sledding ahead. END https://t.co/ByyhY4pOAo', 'none', null, 'seed-negative', 'sample label analysis'),
  ('marykaycabot', 'Deshaun Watson orchestrates 4th fourth-quarter game-winning drive of the season to lead the #Browns to 1st place in the #AFCNorth at 4-2 with a 13-10 victory over the #Ravens. Andre Szmyt kicks the GW as time expires ---&gt;  https://t.co/clBpipZ3If', 'none', null, 'seed-negative', 'sample label game'),
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
🏈2026: Daniel Jones https://t.co/9X8ZeqVldz', 'none', null, 'seed-negative', 'sample label analysis'),
  ('courtneyrcronin', 'FINAL: Bears 31, Falcons 23

Caleb Williams had his 6th career 300-yard passing game, breaking a tie with Mitchell Trubisky for the most such games by a Bears player before turning 25.

Next up: Patriots at home on TNF', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'Xavier McKinney again. Tyson Bagent throws an INT over the middle. Pass went behind Colston Loveland. Looked similar to the one he threw targeting Loveland last week when Minkah Fitzpatrick picked him off.', 'none', null, 'seed-negative', 'sample label game'),
  ('robdemovsky', 'Javon Hargrave is down and receiving medical attention.', 'none', null, 'seed-negative', 'sample label game'),
  ('espndirocco', 'Jaguars are lining up Travis Hunter on Nico Collins, or at least on the same side.', 'none', null, 'seed-negative', 'sample label game'),
  ('kat_terrell', 'I also really needed to go to sleep sooo...', 'none', null, 'seed-negative', 'sample label chatter'),
  ('seifertespn', 'That''s two lost fumbles in the red zone for the Vikings, and this one -- by Myles Price -- get returned 87 yards for a touchdown. A missed PAT means the game is tied at 13, but man...', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'Josh Blackwell having a hell of a game on special teams today. Great punt by Tory Taylor to start with.', 'none', null, 'seed-negative', 'sample label game'),
  ('robdemovsky', 'What the second part of that transaction means: https://t.co/CLKdLSbj0q', 'none', null, 'seed-negative', 'sample label chatter'),
  ('jennalaineespn', 'Rueben Bain Jr. just notched his first career sack. Also had a pass deflection on A''Shawn Robinson''s interception. What a breakthrough for him after a discouraging start to his rookie season that''s included shoulder and groin injuries. He''s kept his head down and worked.', 'none', null, 'seed-negative', 'sample label game'),
  ('bradyhenderson', 'Here was second pick. Third-and-7, game tied in OT. Darnold had Kupp in the flat but said he "just got greedy."

"... I should have just gotten it down to Coop. Cooper ran a really good route right under the sticks and I fee like he would have caught it and got the first down." https://t.co/MiAc59cXJY', 'none', null, 'seed-negative', 'sample label analysis'),
  ('espndirocco', 'That''s a big stop by the Jaguars defense to at least catch a breather.', 'none', null, 'seed-negative', 'sample label game'),
  ('nwagoner', 'Corliss Waitman doing Corliss Waitman things.', 'none', null, 'seed-negative', 'sample label chatter'),
  ('marykaycabot', '#Browns Denzel Ward, minority owner of #Guardians still believes they’re going to win it all, tied 1-1 with the #Rays: https://t.co/Dh8K5kpW6s', 'none', null, 'seed-negative', 'sample label chatter'),
  ('courtneyrcronin', 'Case Keenum is now at quarterback for the Bears', 'none', null, 'seed-negative', 'sample label game'),
  ('jordanraanan', 'The Giants (3-2-1) may not be all that good. But they are hella entertaining!', 'none', null, 'seed-negative', 'sample label chatter'),
  ('espndirocco', '10 https://t.co/hUJL37gP7l', 'none', null, 'seed-negative', 'sample label chatter'),
  ('sarahbarshop', 'The Rams are going for two after their first touchdown of the game.', 'none', null, 'seed-negative', 'sample label game'),
  ('mikereiss', 'Other game balls went to the entire offensive line, and TE Hunter Henry, according to players. 

Henry’s 28th TD catch tied Russ Francis for third place among TEs in franchise history. https://t.co/nWBr7CnrML', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'Brutal penalty for the Bears, who now have 11 for 118. OPI on Colston Loveland who pushes off with his right arm.', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'Pre-game baseball on the SoFi Stadium Oculus. https://t.co/gfJVqd8Otq', 'none', null, 'seed-negative', 'sample label chatter'),
  ('espndirocco', 'Jaguars practice begins at The Grove https://t.co/5fdBCVJwWl', 'none', null, 'seed-negative', 'sample label chatter'),
  ('jennalaineespn', 'Jalon Daniels became the first UDFA rookie QB in the common draft era to win a game for a winless team. It wasn’t his first road victory in the Lone Star State either. At Kansas, he led the Jayhawks to a 57-56 overtime victory at Texas https://t.co/uid3AFP1sF', 'none', null, 'seed-negative', 'sample label game'),
  ('toddarcher', 'Cowboys open with a Javonte Williams'' TD run from the 1 on their first drive of the second half to cut the Packers lead to 17-7. That''s Williams'' seventh rushing touchdown of the year.', 'none', null, 'seed-negative', 'sample label game'),
  ('tim_mcmanus', 'This week would have largely been about praising Nick Sirianni and the coaching staff for a gutty win amid adverse conditions. 

Then came the fateful decision to kick the ball to Abdullah, flipping the result on its head.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('davebirkett', 'Today’s gonna be a mailbag day. What Lions questions are on your mind?', 'none', null, 'seed-negative', 'sample label chatter'),
  ('courtneyrcronin', 'Looked like trainers were cutting off Kendal Daniels'' jersey on the field as they waited for the cart to come out. Not a good scene.', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'Will Reichard is now good from 55 yards, to pair with conversions from 54 and 40 yards earlier in the game, to give the Vikings a 2-score lead. He''s now 15-for-15 on the season, including 5-for-5 from 50+. 

Vikings 23, Saints 13. 7:01 Q4.', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'Rare case where Kevin O''Connell doesn''t have the timeouts he needs in the 2-minute drill. Vikings have to spike at the 36, and are fortunate (as usual) they have Will Reichard. Good from 54. They haven''t scored a TD in their last 8 quarters. 

Saints 7, Vikings 6. HALF.', 'none', null, 'seed-negative', 'sample label game'),
  ('marykaycabot', '#Browns Deshaun Watson on being a 4th quarter gamer and bringing joy to Huntington Bank Field: https://t.co/lmAzHWoLFX', 'none', null, 'seed-negative', 'sample label chatter'),
  ('courtneyrcronin', 'Strong endorsement from Tom Brady, who just said on the broadcast that he believes this is the best game Caleb Williams played as a pro.', 'none', null, 'seed-negative', 'sample label game'),
  ('jennalaineespn', 'This is who Baker is. This is who Jalon is. https://t.co/GriUhzIH8a', 'none', null, 'seed-negative', 'sample label chatter'),
  ('courtneyrcronin', 'The Bears didn’t have much by way of a downfield passing game until Caleb Williams’ return. 

Williams was 5-for-6 for 100 yards (16.7 ypa) and a touchdown on passes thrown 10+ air yards vs. Atlanta. 

In Williams’ absence Weeks 3-5, Bears QBs were 18-34 (10.9 ypa) with 1 TD and 3 INTs on those same throws.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('sarahbarshop', 'Bradley Chubb on what he said to Alaric Jackson before the postgame incident:

“I said: ''We''re gonna see y''all''s ass again. And when we see you again, all that chipping ain''t gonna save you.’”

More from @nicksuss: https://t.co/gX359mkP8U', 'none', null, 'seed-negative', 'sample label chatter'),
  ('holderstephen', 'Jones needs a solid team around him that he can help get to the finish line. Here, he is being asked to do more than that. And I don’t see him as a guy who can truly lift his team.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('josephperson', 'Said all looked pretty good, but noted football shape is different than regular shape. https://t.co/4x15GcSBta', 'none', null, 'seed-negative', 'sample label chatter'),
  ('mikereiss', 'Mike Vrabel arrives, takes note a camera close by that isn’t usually there (for Amazon Prime pre-game show), and asks, “What do you got, Karen?” https://t.co/kWxDhjj5vO', 'none', null, 'seed-negative', 'sample label chatter'),
  ('holderstephen', 'Jonathan Taylor''s 38-yard reception on that screen play was his longest play of the season.', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'Since last season, the Rams have a 66% touchdown rate in the red zone in 20 games with Davante Adams and a 46% rate (6 touchdowns on 13 red-zone drives) in three games without him.

According to ESPN Research, 46% ranks 31st in the NFL over that span while 66% is tied for fourth.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('espndirocco', 'Parker Washington and Brian Thomas Jr. collided on their routes.', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'Kyler Murray is growing more comfortable before our eyes. QBR by week this season:

W1: 2.7 (11 plays)
W2: DNP
W3: 23.6
W4: 34.0
W5: 78.5', 'none', null, 'seed-negative', 'sample label analysis'),
  ('joshweinfuss', 'Arizona''s defense holds again and force the Rams into a 44-yard field goal.  

Rams 3, Cardinals 0. 9:41 left in the first quarter.', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'Aaron Donald has played 19 defensive snaps (79.2%) so far and has two QB pressures and two tackles.', 'none', null, 'seed-negative', 'sample label game'),
  ('bynatetaylor', 'Couldn''t tell anything from rewatching the Chiefs'' touchdown drive. Sometimes the spotter see something and ask for the player to evaluated. Sometimes a player self reports or someone on the sideline reports a concern. https://t.co/nmF3S5r7D9', 'none', null, 'seed-negative', 'sample label chatter'),
  ('jamisonhensley', 'Final: Browns 13, Ravens 10

Baltimore falls to 4-2 because it failed to hold another double-digit lead.

The Ravens didn''t score after the first quarter, and Tyler Huntley was 13-of-24 for 107 yards in the final three quarters.

Next up, Ravens host the Bengals, who are coming off a bye.

The Ravens desperately need Lamar Jackson to return from an ankle injury.', 'none', null, 'seed-negative', 'sample label game'),
  ('espndirocco', '“We consider him an elite wide receiver. I don''t know what everybody else thinks, but we feel like he''s pretty freaking good."

 https://t.co/AXKpNMQycf', 'none', null, 'seed-negative', 'sample label analysis'),
  ('seifertespn', 'Vikings have almost double the time of possession as the Saints. Should bode well for the 4th quarter if they can avoid any more of these mistakes.', 'none', null, 'seed-negative', 'sample label game'),
  ('bynatetaylor', 'Always fantastic to see friends before kickoff. https://t.co/zPBpEal9CV', 'none', null, 'seed-negative', 'sample label chatter'),
  ('toddarcher', 'Cowboys win the toss and will ... receive.', 'none', null, 'seed-negative', 'sample label game'),
  ('jamisonhensley', 'Many of the Ravens players have talked about how offensive coordinator Declan Doyle is an innovator.

Case in point: TE Josh Cuevas runs a route after lining up in the left guard spot.  https://t.co/imGJrvuuRG', 'none', null, 'seed-negative', 'sample label analysis'),
  ('kat_terrell', 'All is calm..at the moment https://t.co/VpDTgZ7jeu', 'none', null, 'seed-negative', 'sample label chatter'),
  ('espndirocco', 'Coverage mistake and an easy TD for the Texans. Foster Moreau wide open in the middle of the field.', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'PUNTER Ethan Evans'' extra point is good and the Rams lead 16-15 with 47 seconds to go.', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'Kyler Gordon blitzes off the edge and sacks Michael Penix Jr. QB didn''t see it coming. 6 yard loss.', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'That was the fourth-longest kickoff return in the NFL this season, according to ESPN Research.', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'Tough scene as Kendal Daniels gets carted off the field. Fans cheer in support but he was not moving as he was taken back to the locker room and likely straight to the hospital.', 'none', null, 'seed-negative', 'sample label game'),
  ('tdavenport_nfl', '#Titans Cam Ward praised the OLine for keeping him clean. He admitted he needs to win the 1v1 with a free rusher. Ward also spoke on the deep game getting better. https://t.co/qy7u2BOzJz', 'none', null, 'seed-negative', 'sample label analysis'),
  ('jamisonhensley', 'The Ravens are 4.5-point favorites for Sunday’s game at the Browns, per @DraftKings.

This marks the 15th time that Baltimore has been favored in the last 18 games in Cleveland.

When favored in Cleveland, the Ravens are 11-3 (.785) outright since 2009. Baltimore’s average margin of victory in Cleveland during this span is 11.5 points.', 'none', null, 'seed-negative', 'sample label game'),
  ('richcimini', 'Jets notable snap counts:

WR: Wilson 61, Patrick 61, Williams 39, McClain 2: Patrick goes from IR to starting role (until Mitchell returns).

TE: Taylor 38, Woods 24, Ruckert 23, Sadiq 13: Woods leapfrogs Ruckert.

ED: Bailey 54, Enagbare 51, McDonald 27, Ossai 20: Ossai left with ankle injury. Edge rotation stretched thin.

#Jets', 'none', null, 'seed-negative', 'sample label analysis'),
  ('robdemovsky', 'The Packers kept it about themselves all week. But when they trounced the Bears, a couple guys fired back.

The story from Sunday’s much-needed win: 
 https://t.co/pmrykLx4ay', 'none', null, 'seed-negative', 'sample label chatter'),
  ('mikereiss', 'NE 26, NY 19

🌥️Win without top performance

⬆️ Henry, Kiner, Wishnowsky

⬇️ A.J. Brown

⏱️5.61 seconds to throw on 1st TD

🧈🖐️A.J. Brown - career-high 3 drops

🚑 Ben Brown (knee), Doubs (shoulder), Moses (ankle), Vera-Tucker (hamstring)

⭐️4th down D

⏭️🐻 Next: at Bears (Thu)', 'none', null, 'seed-negative', 'sample label game'),
  ('joshweinfuss', 'This x a million. 

And figure out third down. https://t.co/TVPj5zmT6y', 'none', null, 'seed-negative', 'sample label chatter'),
  ('nwagoner', 'Seattle calls timeout before this fourth-and-10 play. It has one left which means if #49ers can get a stop, this one is over.', 'none', null, 'seed-negative', 'sample label game'),
  ('mattderrick', 'The things Kenneth Walker can do with the football in his hands ... he''s different than Jamaal Charles or Priest Holmes, but just as special.

How did Seattle have him for four years and not realize this was within him?', 'none', null, 'seed-negative', 'sample label analysis'),
  ('nwagoner', 'Over the past two weeks, Waitman has punted nine times. Six of those have been downed inside the 20 with three of those inside the 10. None of those have been returned. 

His 47.9 net punting average is 4th in the NFL over those two weeks. 

Kyle Shanahan on Waitman: 

"He was unbelievable two weeks in a row. I thought he was huge last week versus Denver, and I thought he was huge this week. We had to play the field position game a ton, and he''s probably another guy we could have given the game ball to."', 'none', null, 'seed-negative', 'sample label analysis'),
  ('kat_terrell', 'All we can control moving forward as far as playing better, coaching better, giving ourselves the opportunities moving forward. I think our guys have the right mindset against the NFL. There''s ups and there''s downs and it''s about navigating those &amp; getting better moving forward."', 'none', null, 'seed-negative', 'sample label chatter'),
  ('joshweinfuss', 'The Cardinals get yet another field goal. 

Arizona 15, LA 9. 9:28 left in the game.', 'none', null, 'seed-negative', 'sample label game'),
  ('jordanraanan', 'J.J. McCarthy''s first drive ends with ... an interception.', 'none', null, 'seed-negative', 'sample label game'),
  ('jamisonhensley', 'Jesse Minter said Derrick Henry addressed the fumble in the locker room.

“Nobody works harder at ball security,” Minter said. https://t.co/HOcKmLnSkV', 'none', null, 'seed-negative', 'sample label analysis'),
  ('jordanraanan', 'Great throw from J.J. McCarthy to Malik Nabers for a 46-yard gain. Giants in business again.', 'none', null, 'seed-negative', 'sample label game'),
  ('espndirocco', 'Cam Little from 60 .... 31-31 with 1:55 to play', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'That was vintage Kyler Murray - literally. His 7 scrambles today were his most in a game since 2020 per ESPN Research.', 'none', null, 'seed-negative', 'sample label game'),
  ('joshweinfuss', 'The Cardinals get a stop on fourth down and take over possession on their own 27.', 'none', null, 'seed-negative', 'sample label game'),
  ('robdemovsky', 'Love picked off, returned for a TD.

MarShawn Lloyd and Sean Rhyan both injured on the play.', 'none', null, 'seed-negative', 'sample label game'),
  ('richcimini', 'Quote from Tim Patrick, who was asked about the ceiling of the Jets'' offense when injured players return:

"We could be the best, honestly. We could be the best. We have so much talent, it''s insane. ... I''ve never been around this much talent, so I don''t even know how to answer that question. It''s going to be scary because it''s just so many different ways we could win."

Reminded that he played on the ''24 Lions (Goff, Gibbs, St. Brown, Williams, LaPorta), Patrick replied:

"I feel like the tight-end room here is what separates from that offense. It''s a little bit more deeper, I would say. ... Obviously, Sam LaPorta is great. Brock (Wright) is great, but from top to bottom, we dress five tight ends every week. Not every team in the NFL can do that, and any one of those guys could be the guy. And we have freaking Sadiq -- he runs 4.3 and he''s not from this planet. So it''s just one of those things where it''s like our tight-end room is going to make us the offense that we''re going to be."

#Jets', 'none', null, 'seed-negative', 'sample label chatter'),
  ('kat_terrell', 'Martin Emerson with another INT', 'none', null, 'seed-negative', 'sample label game'),
  ('nwagoner', 'Not sure the in game scoreboard operators are in touch with what''s happening at the moment. 

Niners working in the red zone and there was a "Get Loud" graphic plastered on the big board. Odd.', 'none', null, 'seed-negative', 'sample label chatter'),
  ('josephperson', 'It’s like @jonmachota’s videos of the Cowboys opening the doors at AT&amp;T Stadium. https://t.co/klwYNOk8t6', 'none', null, 'seed-negative', 'sample label chatter'),
  ('tdavenport_nfl', 'Robert Saleh on Anthony Hill Jr''s TFL in the 2nd half sparking the #Titans and Jeffery Simmons inspiring halftime actions. He called Simmons the best DT in football. https://t.co/xj7sfiqO1H', 'none', null, 'seed-negative', 'sample label analysis'),
  ('davebirkett', 'Dan Campbell with a game ball for Lions play by play announcer Dan Miller after the game today. Campbell choked back tears as he announced the game ball to Miller, who lost his wife to cancer this week. Prayers to Dan and his family.', 'none', null, 'seed-negative', 'sample label chatter'),
  ('bynatetaylor', 'This is an awesome question. I think part of the reason is folks don''t have to rush as much in the morning, they are more prepared. This time of the year is also perfect for a great tailgate.

Primetime games can be incredible for Sunday night. It gets a little tricky on Monday. https://t.co/tSHqqNCj79', 'none', null, 'seed-negative', 'sample label chatter'),
  ('robdemovsky', 'Brandon Cisse comes off holding his right arm/shoulder. Carrington Valentine in.', 'none', null, 'seed-negative', 'sample label game'),
  ('levidamien', 'No QB in 2026 has had a better performance than Drake Maye just did vs #Raiders https://t.co/Uqg74ljZ41 via @TheRaidersWire', 'none', null, 'seed-negative', 'sample label game'),
  ('holderstephen', 'I feel like this is a very worthy performance by Daniel Jones so far. Much better under pressure, more confident in the pocket, protecting the ball. 

The Colts have two issues today: Can''t run the ball and garbage tackling.', 'none', null, 'seed-negative', 'sample label game'),
  ('kat_terrell', 'Martin Emerson broke up a pass in the end zone earlier and Quincy Riley collided with him in the ensuing celebration. Emerson was clutching his side on the sideline and still looks like he''s in pain sitting on the bench.', 'none', null, 'seed-negative', 'sample label game'),
  ('holderstephen', 'I like how they drew this up. Got Downs isolated on the safety and, presto, big play. https://t.co/4N1NsPzkDs', 'none', null, 'seed-negative', 'sample label analysis'),
  ('richcimini', 'There’s a good vibe around the Jets, and now they have an opportunity to build on a W and make a statement in the AFC East.

Wilson: “Big-ass game.”
Brownlee: “It means the world.” #Jets https://t.co/xsOPEP2uVl', 'none', null, 'seed-negative', 'sample label chatter'),
  ('mikereiss', 'Defensive snaps vs. Jets:

🏈 OLB Elijah Ponder (48, sack) up to 74.7% on year

🏈 DT Milton Williams ties season high (46), now 70% for season 

🏈 CB Charles Woods fills in again (40 of 62, INT, game ball); 51.1% on year

🏈 3-CB nickel plan, relies on lighter box to stop run https://t.co/WYZIQ0WJsu', 'none', null, 'seed-negative', 'sample label analysis'),
  ('bradyhenderson', 'On both of his interceptions last night, Sam Danold bypassed an open Cooper Kupp. Here was the first one. Third-and-1, down three, 1:31 left in regulation. He said he thought the DB may have been "driving it." If so, it''s a pick-six waiting to happen. But there was enough space. https://t.co/VvXL7gtY2O', 'none', null, 'seed-negative', 'sample label analysis'),
  ('courtneyrcronin', 'Dayo Odeyingbo just went back to the locker room', 'none', null, 'seed-negative', 'sample label game'),
  ('sarahbarshop', 'Sean McVay was asked about the play call on third and five before the blocked field goal.

“Yeah, I wish I would have had a better play call and gone for it, gotten it a lot tighter. I''m sick right now with myself.”', 'none', null, 'seed-negative', 'sample label chatter'),
  ('seifertespn', 'Justin Jefferson on the TD pass from Kyler Murray into triple coverage: "Definitely wasn''t the most open, but it was a great throw. I mean, there was nothing else that I could do besides just put my hands up and make the grab. That throw was tremendous."', 'none', null, 'seed-negative', 'sample label game'),
  ('mikegarafolo', 'So much good injury news on the timeline today, with a bunch of practice windows eligible to be opened and other players coming back from short-term injuries. A nice change from feeling like half the league was headed to IR a few weeks ago. https://t.co/M0gRUPTuod', 'none', null, 'seed-negative', 'sample label chatter'),
  ('kat_terrell', 'Martin Emerson almost had a 3rd INT there.', 'none', null, 'seed-negative', 'sample label game'),
  ('kat_terrell', 'That was one of the more embarrassing missed tackles I''ve seen..', 'none', null, 'seed-negative', 'sample label chatter'),
  ('tdavenport_nfl', 'Here''s a good example of how the #Titans John Franklin-Myers and Jeffery Simmons rush tandem can thrive. Simmons slashes inside taking two OL, giving JFM the 1v1 and he wins by bull rushing the tackle into Daniel Jones forcing him to step up in the pocket and Simmons cleans it up.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('mikegarafolo', 'Another OT-drive-killing forced fumble. Nate Landman is today’s Daron Payne.  https://t.co/aZ6NcYQ2zd', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'Saints have run only 33 offensive plays in this game and held the ball for 16:57. Just total domination by the Vikings defense.', 'none', null, 'seed-negative', 'sample label game'),
  ('nwagoner', '#49ers had a strong overall pass rushing performance on Sunday. 

Combined for 5 sacks, 15 pressures, 8 QB hits 

Keion White led the way with 4 pressures and a sack. 

Romello Height had a 40% win rate and was credited with 2 incompletions created and an INT created.', 'none', null, 'seed-negative', 'sample label analysis'),
  ('courtneyrcronin', 'Keenum throws an interception at the goal line.', 'none', null, 'seed-negative', 'sample label game'),
  ('espndirocco', 'Jakobi Meyers and Quintin Morris with good blocks on Bhayshul Tuten''s TD catch-and-run. Meyers'' block on the perimeter secured the first down at least.', 'none', null, 'seed-negative', 'sample label game'),
  ('josephperson', 'Just in case anyone needs a reminder about the seriousness of a blood clot traveling to a lung: Panthers OT Taylor Moton returned last week after three months on blood thinners.
https://t.co/h4WdyXqgU2 https://t.co/ga7BAuDKlY', 'none', null, 'seed-negative', 'sample label chatter'),
  ('richcimini', 'FINAL: Patriots 26, Jets 19

Same as it ever was. Jets show fight, but not good enough.

0-7 in the division under Glenn.

Offense should be better than this. Poor at situational football. Lousy in plus territory.

Garrett Wilson - only 2 targets thru first 3 quarters. Inexcusable.

Geno Smith, a bad time for his first pick.

Where was the pass rush? Zero sacks vs patchwork line. Blitzes backfired.

Omar Cooper Jr impressive re-debut.

Jets need to beat Miami and Vegas or else it’s draft watch. #Jets', 'none', null, 'seed-negative', 'sample label game'),
  ('courtneyrcronin', 'What are you even talking about? This is exhausting.  

If fans don’t get the answer they want from a coach/player/GM/etc., then it’s “the media’s fault” for not asking hard enough questions, even if those questions have been asked and, in certain instances, dodged (go listen to some of the coordinator pressers today). 

If a reporter provides tangible proof of why something was perceived a certain way, like the example I pointed out below to how Caleb Williams’ hamstring was spoken about by the team, then I’m “entitled” and how dare I point out what the head coach said VERBATIM because I’m ego tripping?  

Damned if you do, damned if you don’t in this profession. It’s our job to provide context, clarity and ask questions to inform. That isn’t a “new normal.” That’s how the job is done.', 'none', null, 'seed-negative', 'sample label chatter'),
  ('courtneyrcronin', 'Entire Atlanta bench has emptied on the field as trainers are efforting getting Kendal Daniels on the cart. Bears players are telling fans chanting “Green Bay sucks” to stop doing that. https://t.co/SSPfNAebPg', 'none', null, 'seed-negative', 'sample label game'),
  ('joshweinfuss', 'Jacoby Brissett gets picked off by Rams S Quentin Lake, giving the Rams prime field position at the Cardinals 32.', 'none', null, 'seed-negative', 'sample label game'),
  ('seifertespn', 'As it is, it''s an 11-yard loss on first down. We''ve seen that play before in Minnesota. Has it ever worked? Lots of moving parts and, in this case, exposed the QB to unnecessary risk. https://t.co/4UWXnHMWfE', 'none', null, 'seed-negative', 'sample label analysis'),
  ('nwagoner', 'Osa Odighizuwa gets the sack on third down to force a punt. Another good rush design by Raheem Morris had Romello Height coming off Osa''s outside shoulder, forced Washington blockers into conflict and OO gets home.', 'none', null, 'seed-negative', 'sample label game'),
  ('josephperson', 'Jaelan Phillips was with the Eagles last year. But the loudest he’s ever been booed was when he was playing at Philly with the Dolphins, sacked Jalen Hurts in 2023 and celebrated with a Fly Eagles Fly gesture. https://t.co/YlFH0muhFU', 'none', null, 'seed-negative', 'sample label chatter'),
  ('marcraimondi', 'Stefanski: Those are no fun for anybody. Players, coaches. You don''t want to see anyone down like that. kendal is a kid we all love, we all respect. #Falcons', 'none', null, 'seed-negative', 'sample label chatter'),
  ('kat_terrell', 'Carlson''s 51-yard field goal is good', 'none', null, 'seed-negative', 'sample label game'),
  ('ben_baby', 'That was Samaje Perine''s first receiving TD since 2024, when he was with Kansas City. 

First for the Bengals since 2022.', 'none', null, 'seed-negative', 'sample label game'),
  ('nwagoner', '#49ers young defenders growing up in a big way in a big game today:

DT Gracen Halton - 3 tackles, 2 TFL, 1 sack, 1 FF, 1 FR, 1 TD
LB Jaden Dugger - 9 tackles, 1 sack
DT Sebastian Valdez - 3 tackles, 1 sack
CB Renardo Green - 1 tackle, 2 INT, 3 passes defended

DE Romello Height also consistently created pressure.', 'none', null, 'seed-negative', 'sample label game'),
  ('kat_terrell', 'Shough on Gayle Benson: "She wasn''t saying anything that wasn''t already known and she did a really good job of highlighting the expectations and we have those same expectations for ourselves. But more than anything, it just starts with us with one rep, one practice."', 'none', null, 'seed-negative', 'sample label chatter'),
  ('holderstephen', 'Welcome to Pittsburgh, where it has been raining all night and will continue raining throughout the day for Colts at Steelers. Added bonus: Pitt played a game on the same turf just yesterday. Yay. https://t.co/e3zJ1CS8nY', 'none', null, 'seed-negative', 'sample label game'),
  ('tdavenport_nfl', 'Tony Pollard on coping with all the losing https://t.co/kTnqEbUzpR', 'none', null, 'seed-negative', 'sample label chatter'),
  ('espndirocco', 'Eagles have converted 4 of 6 third downs, none bigger than the 62-yard TD pass to WR Darius Cooper.', 'none', null, 'seed-negative', 'sample label game')
on conflict (handle, text) do nothing;
