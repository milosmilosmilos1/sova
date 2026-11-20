/**
 * Tekst pomoći o Sovi (D-172): jedino znanje chatbota podrške u prozoru „Vodič i podrška”. Menja se
 * ovde kad se promeni nešto što korisnik vidi (meni, koraci, cene, mreže, poruke grešaka). Nazivi u
 * navodnicima su tačni natpisi iz aplikacije, a uz prvo pominjanje menija ili strane stoji engleski
 * natpis. Bez internih naziva (servisi, putanje, oznake odluka) i bez podataka korisnika;
 * to proverava `sova-help.test.ts`.
 */
export const SOVA_HELP = `# Sova: znanje za podršku

Stanje na dan 19. novembra 2026. Ovo je jedini izvor znanja za asistenta podrške u Sovi.

## Kako koristiti ovaj tekst

Odgovaraj samo na osnovu ovog teksta. Ako nešto ovde ne piše, reci da ne znaš sigurno i ponudi slanje pitanja podršci.

Nazivi u navodnicima su tačni natpisi iz aplikacije. Kod prvog pominjanja menija ili strane u zagradi je natpis na engleskom (EN).

Dostupnost mreža, plaćanja i nekih funkcija se menja, a ovde je stanje na gornji datum. Ako korisnik kaže da mu nešto već radi, veruj onome što vidi u aplikaciji. Ne obećavaj datume.

Cene u tokenima su trenutne. Tačna cena uvek piše u aplikaciji, na dugmetu ili pored njega.

Nikad ne traži lozinku, kodove za prijavu, podatke kartice ni pristupne podatke za mreže.

## 1. Šta je Sova i kome je namenjena

Sova vodi društvene mreže za biznis. Korisnik unese sajt, a Sova nauči brend (ponudu, publiku, ton, boje, logo), piše objave, crta slajdove u izgledu brenda, nalazi fotografije, priprema nacrte, zakazuje ih, objavljuje i uči iz rezultata.

Namenjena je vlasnicima malih firmi i agencijama i frilenserima koji vode mreže za klijente. Agencija svakog klijenta vodi kao poseban brend.

Podrazumevano se ništa ne objavljuje bez odobrenja korisnika. Objave idu same samo kad to korisnik izričito uključi: viši nivoi Autopilota ili „Zakaži odmah” u Mesečnom planu.

Interfejs je na srpskom i engleskom. Objave Sova piše na srpskom (latinicom ili ćirilicom) i engleskom. Svaka objava je na jednom jeziku: jeziku objava brenda, ili onom koji je izabran za tok ili objavu. Podatke o brendu, teme i poziv na akciju koji su na drugom jeziku Sova prevodi, a vlastita imena (naziv brenda, mesta, proizvoda) ostaju. Ako AI ipak ubaci rečenicu na drugom jeziku, Sova jednom traži ispravku, a provera kvaliteta u Odobravanju to javlja. Utisak klijenta se citira doslovno, pa ga mesečni plan bira samo kad je na jeziku objava, a „Šabloni” upozore kad upisan tekst nije na jeziku objava.

Sova ne pravi AI fotografije. Slike u objavama su besplatne fotografije i snimci sa Unsplash-a i Pexels-a, fotografije iz korisnikove galerije i slajdovi koje Sova nacrta.

## 2. Prvi koraci

### Registracija i prijava

1. Na strani „Napravite nalog” upišite ime, email i lozinku od najmanje 10 karaktera i prihvatite uslove.
2. Kliknite link iz mejla za potvrdu. Link važi 24 sata. Ako mejla nema, proverite spam ili kliknite „Pošaljite ponovo email za potvrdu”.
3. Posle potvrde dobijate 50 besplatnih tokena, jednom po korisniku. Kartica nije potrebna.

Privremene email adrese nisu dozvoljene. Dok email nije potvrđen, AI radnje ne rade. Prijava ide lozinkom ili linkom na email („Prijava linkom na email”), a preko Google naloga ako na strani za prijavu postoji dugme „Nastavite sa Google nalogom”.

### Radni prostor i uvod

Na strani „Početak” (EN: Getting started) izaberite „Jedan biznis” ili „Agencija ili freelancer”, upišite naziv firme (agencija i prvog klijenta) i sajt (ako ga nema, ostavite prazno) i kliknite „Napravite radni prostor”. Radni prostor ima svoj tim, brendove i tokene.

Zatim se otvara „Uvod” (EN: Setup) u sedam koraka:

1. Dobrodošli: jezik aplikacije i jezik objava.
2. Mreže: povezivanje naloga (vlasnik ili administrator).
3. Analiza: sajt (prva analiza je besplatna i traje minut ili dva), PDF o brendu, beleška i ranije objave. Može i bez sajta („Nemam sajt”), ali Brain mora da uči bar iz jednog izvora: sajta, pročitanog PDF-a ili beleške.
4. Brend: glas brenda (sva polja: šta nudite, kome se obraćate, kako zvučite, po čemu ste drugačiji, šta nikad ne pišete i poziv na akciju) i bar tri glavne teme. Predlog sa sajta popunjava i poziv na akciju, od kontakta sa sajta (telefon, email, WhatsApp ili sajt); bez kontakta predlaže „Pišite nam u poruke.”.
5. Izgled: logo brenda (sa sajta ili otpremljen) i tema od boja i fontova.
6. Stil: stil objava i izvor fotografija.
7. Gotovo: spisak šta brendu još fali i teme koje postaju tokovi; svaki tok dva puta nedeljno pravi nacrt karusela za odobravanje (2 tokena po nacrtu). Bez povezane mreže tokovi nastaju pauzirani.

Uvod se ne preskače. Dok brend nije kompletan (Brain, ceo glas brenda i tri teme, logo, boje i stil), Početna, Studio, Objave, Kalendar, Odobravanje, tokovi, Autopilot, Mesečni plan, Strategija, Analitika, Inbox i Šabloni vode na uvod, na korak koji fali, a Sova ne pravi sadržaj za taj brend. Otvoreni su Brend i nalog, Brain, Galerija, Mreže, Tim, Pretplata i podešavanja. Na tim stranama traka „Nastavite podešavanje” vodi na korak koji fali. Mreže nisu uslov: objava može da se preuzme i objavi ručno. Uvod se ponovo prolazi iz prozora Vodič i podrška („Prođite uvod ponovo”), bez dupliranja tokova.

### Četiri ključna koraka

Na strani „Početna” (EN: Home) i u plutajućem dugmetu „Vodič i podrška” (EN: Guide and support) dole desno, aplikacija preporučuje ovim redom:

1. „Povežite mrežu”.
2. „Opišite glas brenda”.
3. „Uključite prvi tok”.
4. „Odlučite o prvom nacrtu”.

Posle toga Sova redovno priprema nacrte. Početna pokazuje i rezultate za 30 dana, nacrte koji čekaju, ovu nedelju, tokove, stanje tokena i „Preporučeno sledeće”, na primer ponovno povezivanje naloga ili dopunu tokena.

### Meni

- „Rad” (EN: Work): „Početna”, „Automatizuj objave” (EN: Automate posts), „Odobravanje” (EN: Approvals), „Inbox” (EN: Inbox), „DM automatizacija” (EN: DM automation), „Objave” (EN: Posts), „Kalendar” (EN: Calendar).
- „Plan i rast” (EN: Planning and growth): „Mesečni plan” (EN: Monthly plan), „Strategija” (EN: Strategy), „Analitika” (EN: Analytics), „Autopilot” (EN: Autopilot).
- „Sadržaj” (EN: Content): „AI Studio” (EN: AI Studio), „Šabloni” (EN: Templates), „Galerija” (EN: Gallery), „Brain” (EN: Brain).
- „Podešavanja” (EN: Settings): „Mreže” (EN: Networks), „Tim” (EN: Team), „Brend i nalog” (EN: Brand and account), „Predlozi i podrška” (EN: Ideas and support).

Gore su birač radnog prostora, birač brenda (kad ih ima više) i link „Novi brend” (EN: New brand), a zvono pored logoa otvara obaveštenja. Na dnu su jezik interfejsa i odjava. Sve u aplikaciji važi za trenutno izabran brend.

## 3. Podešavanje brenda

„Brend i nalog” ima kartice „Glas brenda” (EN: Brand voice), „Vizuelni identitet” (EN: Visual identity), „Stilovi” (EN: Styles), „Sadržaj brenda” (EN: Brand content), „Profili mreža” (EN: Network profiles), „Brendovi” (EN: Brands), „Pretplata” (EN: Subscription) i „Nalog” (EN: Account). Brend podešavaju vlasnik, administrator i urednik.

### Glas brenda

Polja „Šta nudite”, „Kome se obraćate”, „Kako zvučite”, „Po čemu ste drugačiji”, „Šta nikad ne pišete” i „Uobičajen poziv na akciju”, plus do 8 glavnih tema. Ove reči idu u svaki nacrt i imaju prednost nad analizom sajta. Čuvaju se dugmetom „Sačuvaj glas”. „Predloži iz izvora” (2 tokena) popunjava samo prazna polja iz analize sajta, dokumenata i ranijih objava.

„Dokumenti o brendu” primaju PDF do 10 MB, najviše 10 po brendu. Skeniran ili zaključan PDF ostaje „Nije pročitano”.

### Brain

„Brain” pokazuje šta Sova zna o brendu, odakle uči i šta je naučila.

- „Dodaj izvor”: PDF, sajt ili beleška (do 5.000 znakova, najviše 20 po brendu).
- Analiza sajta: prva je besplatna, svaka sledeća 10 tokena. Plan Besplatno čita do 30 strana, plaćeni planovi do 60.
- Svako polje profila brenda ima „Izmeni”. Izmenjeno polje se zaključava i nova analiza ga ne menja („otključaj” to vraća). „Vrati ovu verziju” vraća stariji profil.
- Playbook su pravila koja Sova uči iz rezultata i primenjuje u nacrtima. Osvežava se sam jednom nedeljno, a „Osveži sada” radi kad ima bar 3 objave sa metrikama u 30 dana.
- Posle analize Sova nedeljno proverava sajt i za nov tekst na blogu šalje predlog u Inbox.

### Vizuelni identitet i stilovi

„Izgled objava” (EN: Post look): Sova od boja i fontova sa sajta predloži tri svetle i tri tamne teme. Sedma je „Vaša tema”: bilo koji od 28 stilova, tri boje i font (sa sajta, „Drugi Google font” ili „Otpremi svoj font”: TTF, OTF ili WOFF do 2 MB). „Sačuvaj temu” važi za sve nove objave. Postojeći nacrti se prebacuju u temu dugmetom „Uskladi sa temom”, bez tokena.

Na istoj strani su logo („Otpremi logo”, PNG, JPG ili WebP do 20 MB, najbolje PNG sa providnom pozadinom; „Vrati logo sa sajta”), boje brenda, „Fotografije u objavama” („Bez fotografija”, „Besplatne fotografije” ili „Moja galerija”), format („Uspravno 4:5” ili „Kvadrat 1:1”; priča je 9:16), broj slajdova (3 do 20) i „Nalog na slajdovima”. Čuva se sa „Sačuvaj dizajn”. Bez logoa slajd ispisuje ime brenda, a slabo čitljiv tekst sam dobija čitljiviju boju.

Kartica „Stilovi” nudi 28 stilova. Stil kome treba fotografija, a nema je, crta slajd kao preliv u bojama brenda.

„Šabloni iz Figme” (EN: Templates from Figma) još nisu uključeni za sve naloge. Ko ih ne vidi u Vizuelnom identitetu, za njega još nisu dostupni.

### Galerija i sadržaj brenda

U „Galerija” dodajete fotografije („Dodaj fotografije”), pravite kategorije (do 30) i pišete opise. „Opiši automatski” košta 1 token po fotografiji. Izmene se čuvaju sa „Sačuvaj izmene”. Sova bira fotografiju iz galerije po temi, opisu i kategoriji, sa prednošću za onu koja najduže nije korišćena.

„Sadržaj brenda”: utisci klijenata (tačno kako su napisani i samo uz dozvolu), ljudi iz tima i radovi pre i posle, sa fotografijama iz Galerije. Za vrste „Utisci klijenata”, „Pre i posle”, „Ljudi iza brenda”, „Ankete i pitanja” i „Humor” birate „Automatski”, „Uključeno” ili „Isključeno”. Sova ništa ne izmišlja. Mesečni plan ih sam raspoređuje, a u Ručnim alatima Studija (Nova objava) biraju se u polju „Sadržaj”.

### Profili mreža

- „Opisi profila” (3 tokena): opis za svaku mrežu, u njenim granicama. „Kopiraj i otvori profil” kopira tekst i otvara stranu za izmenu profila na mreži. Sova sama upisuje opis samo na Google poslovni profil („Objavi na profilu”), kad je povezan.
- „Instagram highlights” (3 tokena): teme, naslovne i priče („Napravi priču” šalje priču u Odobravanje). Na profil ih dodajete sami, jer Instagram to aplikacijama ne dozvoljava.
- „Profilna i naslovne slike”: profilna slika za sve mreže i naslovne za Facebook, LinkedIn, X, YouTube i Pinterest, u njihovim veličinama, bez tokena.
- „Sadržaj za profile po mreži” (3 tokena): objave za vrh profila, Pinterest table, Google usluge, YouTube plejliste, pitanja za početak razgovora.

## 4. Povezivanje mreža

Mreže povezuju vlasnik ili administrator. Ostali na pločici vide „Povezuje administrator”.

1. Otvorite „Mreže” i kliknite pločicu sa natpisom „Poveži”.
2. Prijavite se na stranici mreže i dozvolite pristup. Lozinku unosite samo na stranici mreže; Sova je ne vidi.
3. Štiklirajte naloge na koje Sova sme da objavljuje i kliknite „Poveži izabrane”.
4. Sova u roku od minut uveze ranije objave i uči iz njih.

Ostali natpisi na pločicama su „Povezano: N, dodaj još”, „Privremeno isključeno” i „Uskoro”. Plan Besplatno dozvoljava 2 mreže, plaćeni planovi 10.

### Šta je dostupno (19. 11. 2026)

Svaka mreža mora da odobri Sovu za javnu upotrebu, a većina odobrenja je u toku.

- LinkedIn lični profil: dostupno. Veza traje 60 dana; 7 dana pre isteka stiže obaveštenje, a „Poveži ponovo” je uvek dostupno.
- LinkedIn stranica firme: još nije dostupno.
- Facebook stranice i Instagram: još nisu dostupni svim korisnicima, čeka se odobrenje Mete. Pločica može da kaže „Poveži”, ali prijava za većinu naloga neće proći.
- TikTok: još nije dostupno.
- YouTube (Shorts) i Google poslovni profil: još nije dostupno, čeka se odobrenje Google-a.
- Pinterest i X: još nije dostupno („Uskoro”).

Za nedostupnu mrežu reci da Sova čeka odobrenje i da datum nije poznat. Ako je hitno, korisnik piše podršci.

### Šta traži koja mreža

- Facebook: administrator stranice. Ako ne vidite sve stranice, kliknite ponovo „Poveži”, u prozoru Facebook-a izaberite „Uredi podešavanja” (Edit settings) i označite sve stranice.
- Instagram: poslovni nalog povezan sa Facebook stranicom, ista prijava preko Facebook-a.
- YouTube: Google nalog sa YouTube kanalom.
- Google poslovni profil: vlasnik ili menadžer verifikovanog profila.
- Pinterest: bar jedna tabla.

### Upravljanje nalozima

Status naloga je „aktivno”, „treba ponovo povezati”, „isključeno” ili „opozvano”. Dugmad su „Sinhronizuj”, „Istorija objava”, „Poveži ponovo” i „Prekini vezu”. „Prekini vezu” briše vezu i uvezene objave u Sovi; objavljeno ostaje na mreži.

„Asistirano objavljivanje” znači da Sova na tom nalogu ne objavljuje sama. U terminu stiže obaveštenje, a na strani objave kliknete „Kopiraj tekst”, preuzmete medije, objavite ručno i kliknete „Označi kao objavljeno”.

## 5. Pravljenje sadržaja

### Vrste objava

„Samo tekst”, „Slika”, „Karusel” (3 do 20 slajdova), „Video (Reels)”, „Priča (Story)”, „Link” i „Anketa” (samo LinkedIn i X, 2 do 4 odgovora). Priču primaju samo Instagram i Facebook, a Instagram ne prima objavu bez slike. „AI bira” bira vrstu koju primaju sve izabrane mreže. Facebook prima najviše 10 slika, pa duži karusel tamo ide sa prvih devet i poslednjim slajdom. Na LinkedIn-u slajdovi koje nacrta Sova idu kao PDF dokument koji se prevlači, a fotografije kao mreža slika.

### AI Studio

„AI Studio” je razgovor sa Sovom: levo poruke, desno objava.

1. Opišite objavu, priložite do četiri fotografije (sa računara ili iz galerije) ili nalepite link do proizvoda.
2. U delu „Sledeća objava” izaberite vrstu, mreže i jezik.
3. Sova desno napravi objavu sa tekstom, slajdovima i fotografijama.
4. Izmene tražite rečima, npr. da skrati opis ili promeni naslov drugog slajda.
5. Objavu zakažite ili objavite desno, kao u Odobravanju.

Poruka košta 1 token. Poruka koja napravi objavu ne plaća se posebno, plaća se tekst objave (2 tokena). Zakazana ili objavljena objava se ne menja iz razgovora. „Obriši razgovor” briše poruke, a objave ostaju.

### Ručni alati

„Ručni alati” (EN: Manual tools) u Studiju imaju kartice:

- „Nova objava” (EN: New post): mreže, jezik, vrsta ili „AI bira”, tema, poziv na akciju, link i heštegovi, pa „NAPRAVI OBJAVU”. Nastaje nacrt („Otvori nacrt i zakaži”). Tekst košta 2 tokena, slajdovi ništa, a „Vizual iz šablona” još 2.
- „Tekst za objavu” (2 tokena) i „Vizual iz šablona” (2 tokena).
- „Unsplash fotografije” i „Pexels video i fotografije”: bez tokena, u biblioteku brenda sa imenom autora.
- „Iz Canve” i „Iz Figme”: ove veze još nisu dostupne svim korisnicima.

### Šabloni

„Šabloni” (EN: Templates) su objave sa podacima koje samo biznis zna, pa ih Sova ne izmišlja: korisnik popuni polja, Sova nacrta slajdove u stilu, bojama i sa logom brenda i složi opis. Ne troše tokene i ne koriste AI, pa rade i kad AI ne radi. Ima ih 18, u četiri grupe:

- „Ljudi i poverenje”: „Član tima”, „Utisak klijenta”, „Pre i posle”, „Rezultat za klijenta”, „Iza kulisa”.
- „Zajednica”: „Kviz”, „Anketa”, „Česta pitanja”, „Nagradna igra”.
- „Ponuda”: „Akcija”, „Novo u ponudi”, „Cenovnik”, „Događaj”.
- „Vesti”: „Jubilej”, „Zapošljavamo”, „Obaveštenje”, „Nagrada i sertifikat”, „Saradnja”.

Kako ide: izaberite šablon i „Popuni”, upišite polja (neobavezna su označena), izaberite oblik („Jedna slika”, „Karusel” ili „Priča (9:16)”, koliko šablon nudi) i mreže (bez izbora idu sve povezane). Desno je „Pregled” slajdova, a ispod polja „Opis objave”, koji Sova složi od podataka; možete ga menjati, a „Vrati predlog” vraća Sovin. „Napravi nacrt” pravi nacrt i otvara ga u editoru, gde se zakazuje. Fotografije su samo vaše: „Iz galerije” ili „Otpremi” (PNG, JPEG, WebP); Sova ovde nikad ne uzima fotografije sa Unsplash-a ni Pexels-a. Utisak klijenta ide tačno kako je napisan. „Pre i posle” kao jedna slika stavlja dve fotografije jednu do druge (levo pre, desno posle), a kao karusel daje slajd pre, slajd posle i poziv. Anketa i kviz pozivaju na odgovor u komentarima, jer Instagram i Facebook kroz Sovu nemaju prave ankete. Objava iz šablona se ne može „Generiši ponovo”, jer bi AI izmislio tekst; menja se u editoru. Šabloni su dostupni kad je brend kompletno podešen.

### Ručni editor

„Nova objava” na stranama Objave, Kalendar i Početna otvara editor za objavu koju pišete sami:

1. Upišite tekst; za svaku mrežu može drugačiji (prazno znači isti).
2. Po želji dodajte link, prvi komentar (Instagram, Facebook, LinkedIn), stub sadržaja i kampanju.
3. Izaberite naloge; za Instagram i Facebook postoji „Objavi kao priču (Story)”.
4. Dodajte medije iz biblioteke ili otpremite fotografiju ili video (MP4, MOV).
5. Izaberite termin u zoni brenda i kliknite „Sačuvaj nacrt”, „Pošalji na odobrenje”, „Zakaži” ili „Objavi sada”.

Ako slika nema odnos stranica koji mreža prima, editor nudi „Iseci na …”; original ostaje. Posle osvežavanja strane editor nudi „Vrati nacrt” ili „Odbaci”.

### Fotografije

Kad bira sama, Sova uzima fotografije sa Unsplash-a pa Pexels-a, a video sa Pexels-a. Proverava da fotografija prikazuje temu i staje u okvir slajda i ne ponavlja fotografije brenda. Ako u kratkom roku ne nađe dovoljno, objava ide sa onim što je našla, a slajd bez fotografije ostaje kao preliv u bojama brenda.

Svoje fotografije dodajte u Galeriju i izaberite „Moja galerija”, ili ih priložite u Studiju. Slika može imati do 20 MB (JPG, PNG, WebP), video do 50 MB. HEIC i GIF se ne primaju.

### Mesečni plan

1. U „Mesečni plan” kliknite „Nov plan”.
2. Izaberite početak, „Koliko meseci unapred” (1 do 3), broj objava nedeljno, mreže, vrste („Sve vrste”), jezik i po želji šta je važno u periodu.
3. „Napravi plan” (3 tokena po mesecu): Sova za oko pola minuta po mesecu bira temu, vrstu i termin svake objave, najviše 60 mesečno.
4. Stavke izmenite ili obrišite.
5. Izaberite „Na odobravanje” (nacrti čekaju u Odobravanju sa terminom iz plana) ili „Zakaži odmah” (bez odobravanja; samo vlasnik i administrator).
6. „Generiši sve”: 2 tokena po nacrtu. Stranu možete zatvoriti; na kraju stiže obaveštenje.

Treba bar jedna povezana mreža i potvrđen email. Nov plan zamenjuje plan za iste dane, osim plana iz kog su nacrti napravljeni. „Obriši plan” ne briše napravljene nacrte.

### Automatizuj objave (tokovi)

Tok je jedna tema sa formatom, stilom i danima pripreme. U te dane Sova napiše tekst, nacrta slajdove i pošalje nacrt na odobravanje. Vreme u toku je vreme pripreme; vreme objave birate pri odobravanju.

1. Kliknite „Nova automatizacija”.
2. Tema: naziv, tema i cilj.
3. Format i stil: karusel, objava ili priča, broj slajdova, fotografije (može samo jedna kategorija galerije), jezik, mreže ili „Automatski uključi povezane mreže”, do tri Instagram saradnika.
4. Raspored: dani i vreme pripreme, ili „Sova bira vreme”.
5. „Sačuvaj automatizaciju”.

Nacrt košta 2 tokena. „Generiši odmah” pravi nacrt odmah, a prekidač „Tok je aktivan” pauzira tok.

### Strategija

„Nova strategija” (20 tokena, do 2 minuta) pravi plan za 2 do 12 nedelja: ciljeve, stubove, nedeljne teme, najbolja vremena, heštegove i kampanje. Uključuje se dugmetom „Aktiviraj”. „Napravi kalendar” bez tokena pravi nacrte sa temom i kratkim planom; tekst pišete sami ili ga popuni Autopilot. Treba bar jedna povezana mreža. Neuspelo pravljenje vraća tokene.

### Autopilot

Nivo se bira po brendu, a menjaju ga vlasnik i administrator.

- 0 „Ručno”: nema automatskih nacrta.
- 1 „Kopilot”: ponedeljkom u 06:00 po zoni brenda Sova pripremi nacrte za narednu nedelju iz aktivne strategije; sve ide na odobrenje.
- 2 „Autopilot sa odobrenjem”: Sova pravi i strategiju; neodobrene objave posle roka se preskaču ili objavljuju, po podešavanju.
- 3 „Pun autopilot”: objavljuje bez odobrenja na izabranim nalozima. Ako piše „uskoro”, još nije dostupan.

Podešava se mesečni budžet tokena (upozorenje na 80 %, stop na 100 %), rok za odobrenje, šta sa neodobrenim, jezik i vrste. Najviše 21 nacrt nedeljno. „Pauziraj sve” zaustavlja Autopilot i sve zakazane objave brenda; „Nastavi” vraća one čiji termin nije prošao. Nacrt koji ne prođe kontrolu kvaliteta vraća se na doradu („Autopilot vratio objavu”).

### Dorada nacrta

- „Generiši ponovo” (2 tokena): nov tekst i slajdovi, iste fotografije. Samo za objave koje je nacrtala Sova, pre zakazivanja.
- „Tekst na slikama” (kod videa „Tekst u videu”): menja samo reči na slajdovima, bez tokena.
- „Napravi video”: od karusela pravi video (9:16 ili 4:5) kao nov nacrt, bez tokena.
- „Preuzmi” daje slajdove kao ZIP, a „Pregled na mreži” pokazuje izgled na svakoj mreži.

Video objave koje pravi Sova završavaju se u pregledaču dok je Odobravanje otvoreno, u Chrome-u, Edge-u ili novijem Safariju. Dok video nije gotov, objava ne može da se zakaže.

## 6. Odobravanje, zakazivanje i objavljivanje

### Odobravanje

„Odobravanje” ima kartice „Čekaju”, „Odobreni”, „Objavljeni”, „Preskočeni” i „Svi”. Broj u meniju je broj nacrta koji čekaju. Za nacrt vidite slajdove, opis za svaku mrežu sa brojačem znakova, prvi komentar i termin. Predlog termina je sledeći slobodan termin ili sutra u 10:00, u zoni brenda; nacrt iz plana nosi termin iz plana.

Radnje su „Sačuvaj i zakaži” (izmene, odobrenje i zakazivanje u jednom potezu), „Objavi odmah”, „Sačuvaj izmene”, „Generiši ponovo”, „Preskoči”, „Preuzmi” i „Uredi objavu”. Preskočen nacrt se vraća iz editora („Vrati u nacrt”). Više nacrta odjednom: „Označi sve”, pa „Zakaži” („Termini iz plana” ili „Rasporedi od datuma”), „Preskoči” ili „Obriši”.

### Ko šta sme

Urednik piše objave i šalje ih na odobrenje. Odobravalac odobrava, traži izmene ili odbija, uz obavezan komentar za izmene i odbijanje. Vlasnik i administrator mogu sve, i zakazivanje bez odobravanja i brisanje objava. Posmatrač samo gleda.

### Odobrenje klijenta bez naloga

U editoru objave, „Javni link za klijenta” (EN: Public link for the client), dugme „Napravi link”. Važi za objave „na odobrenju”. Klijent bez naloga odobrava, traži izmene ili odbija i komentariše. Link važi 7 dana.

### Kalendar i Objave

„Kalendar” pokazuje objave po mesecu ili nedelji, u zoni brenda. „Objave” je lista sa filterima Nacrti, Na odobrenju, Odobreno, Zakazano, Objavljeno, Neuspelo i Odbijeno i otkazano.

### Pravila zakazivanja

- Vreme je u zoni brenda. Zona se menja u Brend i nalog, kartica Nalog, deo Brendovi („Sačuvaj zonu”); zakazane objave mogu da zadrže isto lokalno vreme.
- Termin ne može biti u prošlosti (tada „Objavi sada”) ni dalje od godinu dana.
- Pre zakazivanja Sova proverava tekst, heštegove, medije i odnos stranica za svaku mrežu.
- Facebook, LinkedIn i X odbijaju isti tekst na istom nalogu; Sova javlja ako je isti tekst tu objavljen ili zakazan u poslednjih 30 dana.
- Zakazana objava se ne menja: „Otkaži zakazivanje” je vraća u nacrt. Postoje i „Pauziraj” i „Nastavi”. Vlasnik i administrator mogu da zamene sliku ili video bez otkazivanja termina.

### Šta se dešava u terminu

Status ide od „Zakazano” preko „Objavljuje se” do „Objavljeno”, „Delimično objavljeno” ili „Neuspelo”. Kod privremene greške Sova pokušava do 3 puta, posle 1, 5 i 15 minuta. Kad se potroši dnevni limit mreže (Instagram: 100 objava za 24 sata po nalogu), termin se pomera za 24 sata uz obaveštenje „Objava pomerena”. Objava koja kasni više od 15 minuta šalje obaveštenje „Objava kasni”. Ako prvi komentar ne uspe, objava ostaje objavljena.

### Kad objava ne uspe

1. Otvorite objavu i pročitajte poruku kod mreže.
2. Ako piše „traži ponovno povezivanje”, vlasnik ili administrator klikne „Poveži ponovo” u Mrežama.
3. Kliknite „Pokušaj ponovo” kod te mreže. Objava ide u sledećem punom minutu.
4. Kod „Delimično objavljeno” ponovite samo neuspele mreže.

Česte poruke: „Veza sa mrežom je istekla ili je opozvana. Povežite nalog ponovo.”, „Mreža je odbila medij (format, veličina ili odnos stranica).”, „Mreža je odbila sadržaj objave.”, „Nalog na mreži je ograničen. Proverite obaveštenja na mreži.”

## 7. Inbox, analitika i izveštaji

### Inbox i DM automatizacija

„Inbox” ima kartice „Poruke”, „Komentari”, „Recenzije” i „Predlozi”. Prve tri čekaju odobrenje Mete („Čeka odobrenje Mete”). Kartica „Predlozi” (EN: Suggestions) radi: predlozi stižu iz bloga i promena na sajtu, iz analitike i AI uvida, a za praznike kad je Autopilot na nivou 1 ili višem. „Prihvati” pravi nacrt, „Odbaci” sklanja predlog.

„DM automatizacija” odgovara na komentare sa ključnom reči i šalje privatnu poruku sa linkom. Tokovi mogu da se pripreme, ali se uključuju tek kad Meta odobri dozvole za poruke.

### Analitika

„Analitika” za 7, 30 ili 90 dana pokazuje objave, doseg, angažovanje (reakcije, komentari, deljenja, čuvanja) i stopu angažovanja, po mreži i stubu, najbolje objave i pratioce. Metrike objave stižu 1 sat, 24 sata, 7 i 30 dana posle objave, a metrike naloga svakog jutra. „Osveži” ih povlači odmah. AI uvidi stižu nedeljom uveče ili na „Generiši uvide”, uz bar 3 objave sa metrikama, bez tokena.

### Mesečni izveštaj

„Mesečni izveštaj (PDF)” (EN: Monthly report (PDF))) je u Analitici: izaberite mesec, „Napravi PDF”, pa „Preuzmi”. Prvog u mesecu ujutru izveštaj za prethodni mesec stiže sam vlasniku i administratorima, a klijentu emailom ako su upisane adrese (do 5). Adrese menjaju vlasnik i administrator.

### Obaveštenja

Zvono pokazuje nepročitana, a strana „Obaveštenja” (EN: Notifications) sva obaveštenja. Šta stiže u aplikaciji, a šta i na email, bira se na kartici Nalog, deo Obaveštenja, po radnom prostoru.

Kartica „Odobravajte sa telefona” (EN: Approve from your phone) na početnoj objašnjava instalaciju: Android, meni ⋮ pa „Instaliraj aplikaciju”; iPhone, Podeli pa „Dodaj na početni ekran”. Ako piše da obaveštenja na uređaju još nisu podešena, ta mogućnost još nije uključena.

## 8. Tim, uloge, brendovi i agencije

Vlasnik ima sve. Administrator ima sve osim naplate. Urednik pravi i menja sadržaj i zakazuje odobrene objave. Odobravalac (obično klijent) odobrava i komentariše. Posmatrač samo gleda. Mreže povezuju vlasnik i administrator, a plaćanja vodi samo vlasnik.

### Pozivanje člana

1. U „Tim” popunite „Pozovite člana”: email i uloga.
2. U „Pristup brendovima” izaberite brendove (ništa izabrano znači svi).
3. Kliknite „Pošaljite pozivnicu”.

Pozivnica stiže emailom, važi 7 dana i samo za tu adresu. Osoba se prijavi ili registruje tom adresom i klikne „Prihvatite pozivnicu”. Pozivnice se mogu opozvati („Opozovi”). Pozivaju vlasnik i administrator. Besplatno ima samo vlasnika, a Mesečni i Godišnji do 2 člana sa vlasnikom; pozivnice koje čekaju se računaju.

Vlasnik i administrator menjaju uloge i uklanjaju članove („Ukloni”). Član može da ode sam („Napustite”). Kroz „Prenos vlasništva” (EN: Transfer ownership) vlasnik prenosi vlasništvo na postojećeg člana, a sam postaje administrator.

### Brendovi i radni prostori

Svaki brend ima svoj glas, izgled, mreže, kalendar i izveštaje. Nov brend se dodaje linkom „Novi brend” ili na kartici Brendovi; odmah postaje trenutni i otvara se njegov uvod. Besplatno ima 1 brend, plaćeni planovi do 5. „Arhiviraj” (vlasnik i administrator) otkazuje zakazane objave tog brenda. Radni prostor se menja biračem na vrhu menija, kad ste član više njih.

Agencija vodi svakog klijenta kao brend. Klijent odobrava preko javnog linka ili kao član sa ulogom Odobravalac i pristupom svom brendu, a mesečni izveštaj mu može stizati emailom.

## 9. Planovi, cene i tokeni

### Planovi

- „Besplatno” (EN: Free): 0 €, 50 tokena jednom, 1 brend, 2 mreže, 1 član.
- „Mesečni” (EN: Monthly): 47 € mesečno, 500 tokena svakog meseca, do 5 brendova, 10 mreža i 2 člana.
- „Godišnji” (EN: Yearly): 297 € godišnje, plaćeno unapred, 500 tokena svakog meseca, isti limiti.

47 € i 297 € su uvodne cene; pored njih stoji precrtana redovna cena od 90 € i 500 €. Dopune: 100 tokena za 12 €, 300 za 30 €, 1.000 za 85 €. Kupljeni tokeni ne ističu i troše se posle tokena iz pretplate, koji važe za tekući mesec.

### Tokeni

Tokeni se troše kad AI nešto napravi. Kalendar, analitika i objavljivanje ne troše tokene, osim objava na X-u (1, sa linkom 6), kad X bude dostupan. Trenutne cene:

- tekst objave (Nova objava, nacrt toka ili plana, Generiši ponovo, Predloži iz izvora): 2
- poruka u AI Studiju, opis fotografije, predlog odgovora u Inboxu: po 1
- Mesečni plan: 3 po mesecu, plus 2 po nacrtu
- strategija: 20; ponovna analiza sajta: 10 (prva besplatna)
- opisi profila, highlights, sadržaj za profile: po 3
- vizual iz šablona, uvoz iz Canve: po 2
- bez tokena: slajdovi, fotografije sa Unsplash-a i Pexels-a, Tekst na slikama, Uskladi sa temom, Napravi video, AI uvidi

Sova rezerviše tokene pre radnje i vraća ih kad radnja ne uspe. Stanje je na Početnoj, u Studiju i na kartici Pretplata.

Kad tokena nema: „Nemate dovoljno tokena za ovu radnju. Dopunite tokene pa pokušajte ponovo.” Tokovi i Autopilot tada ne prave nacrte, a zakazane objave i dalje izlaze.

### Plaćanje

Kartica „Pretplata” (naslov strane „Naplata”, EN: Billing) ima plan, ponudu, „Dopuna tokena” (EN: Token top-up) i „Istorija tokena” (EN: Token history) za vlasnika i administratora. Plaća samo vlasnik.

Kad je online plaćanje uključeno, „Pretplatite se” vodi na plaćanje karticom, a „Upravljajte pretplatom i karticom” na karticu i otkazivanje. Po čestim pitanjima na sajtu, plan posle otkazivanja ostaje aktivan do kraja plaćenog perioda. Ako na kartici piše da plaćanje još nije uključeno, kupovina u aplikaciji nije moguća i korisnik piše podršci.

Ako plaćanje pretplate ne uspe, vlasnik ima 7 dana da ažurira karticu, uz podsetnike. Posle roka generisanje staje, a zakazane objave i dalje izlaze. Kad se dostigne limit plana, poruka nudi nadogradnju. Besplatno ima i dnevnu granicu generisanja.

## 10. Nalog i bezbednost

- Zaboravljena lozinka: „Zaboravili ste lozinku?” na prijavi, pa link iz mejla. Lozinka se menja isto, preko linka na email.
- Posle 5 neuspelih prijava čeka se 15 minuta.
- Dvofaktorska zaštita: kartica Nalog, link „Bezbednost” (EN: Security), „Uključite dvofaktorsku zaštitu”. Skenirajte QR kod aplikacijom za kodove i upišite 6-cifreni kod. Za isključivanje treba kod iz aplikacije.
- „Vaš profil” na kartici Nalog: ime, jezik i vremenska zona. Jezik interfejsa je i na dnu menija. Jezik objava je poseban izbor.
- Email adresa naloga ne menja se u aplikaciji.
- Odjava u jednom tabu odjavljuje sve tabove.
- „Privatnost i podaci” (EN: Privacy and data): „Preuzmi moje podatke (JSON)” (najviše 3 puta na sat) i „Obriši nalog…”. Brisanje je trajno: brišu se nalog, radni prostori u kojima ste sami, objave, mediji i veze sa mrežama. Vlasnik tima sa članovima prvo prenosi vlasništvo. Asistent samo kaže gde je opcija i upućuje na podršku.

## 11. Vodič, predlozi i podrška

Dugme „Vodič i podrška” je dole desno na svim stranama osim uvoda. Kartica „Vodič” (EN: Guide) ima ključne korake, uvod, „Predložite funkciju”, „Prijavite problem” i „Pišite podršci”. Kartica „Pitaj Sovu” (EN: Ask Sova) daje automatske odgovore o Sovi; razgovori se čuvaju 90 dana. „Pošalji razgovor podršci” šalje razgovor timu kao prijavu problema.

Na strani „Predlozi i podrška” korisnici predlažu funkcije i glasaju. Ideje vide svi, bez imena autora, a status (Ideja, Planirano, U izradi, Gotovo, Odbijeno) menja tim Sove. Prijavu problema vide samo autor i tim Sove. Dobra prijava ima korake, tekst sa ekrana i naziv strane, a uz grešku i ID greške.

Email podrške je office@tangerineseo.com, na srpskom ili engleskom.

## 12. Rešavanje čestih problema

- Povezivanje Facebook-a, Instagrama, TikToka, YouTube-a ili Google profila ne uspeva: te mreže još nisu odobrile Sovu za sve (poglavlje 4).
- Instagram se ne pojavljuje posle prijave: nalog mora biti poslovni i povezan sa stranicom kojoj ste administrator. Ponovo „Poveži”, pa „Uredi podešavanja” u prozoru Facebook-a.
- „Povezivanje je otkazano na mreži.”: pokušajte ponovo i dozvolite pristup.
- Nalog „treba ponovo povezati” ili objava „traži ponovno povezivanje”: vlasnik ili administrator klikne „Poveži ponovo” u Mrežama, pa „Pokušaj ponovo” na objavi. LinkedIn to traži na 60 dana.
- „Vaša uloga ne dozvoljava ovu radnju.” ili „Nemate dozvolu za ovu radnju.”: ulogu menja vlasnik ili administrator u Timu.
- „Objava prvo ide na odobrenje…”: kliknite „Pošalji na odobrenje”.
- Slajd bez fotografije: Sova nije našla odgovarajuću ili je izvor „Bez fotografija”. Izaberite „Moja galerija” ili priložite fotografije u Studiju.
- Fotografija ne odgovara temi: „Generiši ponovo” zadržava fotografije, pa objavu napravite ponovo u Studiju sa svojim fotografijama.
- Pogrešan logo: „Otpremi logo” u Vizuelnom identitetu; nacrti koji čekaju se prepravljaju sami.
- Greška u tekstu na slajdu: „Tekst na slikama”. Ako piše „Ovu sliku nije nacrtala Sova…”, menja se samo opis.
- „Objavu je u međuvremenu neko izmenio…”: osvežite stranu i unesite izmene ponovo.
- „Zakazana ili objavljena objava se ne generiše ponovo…”: prvo „Otkaži zakazivanje”.
- „Video još nije napravljen…”: otvorite Odobravanje u Chrome-u, Edge-u ili Safariju i sačekajte.
- „Vreme je u prošlosti…”: budući termin ili „Objavi sada”.
- „Isti tekst je već objavljen…”: izmenite tekst.
- Pogrešan odnos stranica slike: „Iseci na …”.
- „HEIC format još nije podržan…” ili „GIF još nije podržan…”: sačuvajte kao JPG ili PNG.
- „Izabrane mreže nemaju zajedničku vrstu objave…”: posebne objave.
- „Previše zahteva u kratkom roku…”: sačekajte malo. „Previše pokušaja prijave…”: 15 minuta.
- Mejl ne stiže: spam, pa ponovo. Ako traka na vrhu kaže da se emailovi još uključuju, ili mejla i dalje nema, podrška.
- Analiza sajta nije uspela: poruka kaže zašto (robots.txt zabranjuje „SovaBot”, provera pregledača, sajt na JavaScriptu, sajt nedostupan). Dodajte PDF i popunite Glas brenda.
- „AI servis trenutno nije dostupan…”: pokušajte za nekoliko minuta; tokeni se vraćaju.
- „Sadržaj nije prošao bezbednosnu proveru…”: preformulišite temu.
- Tok nije napravio nacrt: nema tokena, nema mreže za taj format ili servis nije odgovorio.
- Inbox je prazan: čeka odobrenje Mete; Predlozi rade.
- „Server nije stigao da završi na vreme…”: osvežite stranu i ponovite ostatak.
- „Stigla je nova verzija Sove”: strana se sama osveži; ponovite radnju.
- Traka „Pregled: još se uključuju …”: navedeno još nije uključeno, ostalo radi.

## 13. Kada uputiti na podršku

Ove slučajeve rešava čovek. Ponudi „Pošalji razgovor podršci”, „Prijavite problem” ili email office@tangerineseo.com.

- Naplata: povraćaj novca, sporna ili dupla naplata, računi i PDV, kupovina dok plaćanje nije uključeno, trajanje uvodne cene.
- Brisanje naloga, radnog prostora ili brenda, vraćanje arhiviranog brenda, zahtevi za brisanje podataka.
- Izgubljeni podaci: objave, nacrti, fotografije, tokeni.
- Greške: strana „Nešto je pošlo naopako” (uz ID greške), dugme koje ne radi, greška koja se ponavlja, objava koja ponovo pada bez jasne poruke.
- Bezbednost: sumnja na tuđi pristup, izgubljen telefon sa kodovima, „Nalog je blokiran”, promena email adrese.
- Lični podaci, pravna pitanja i rokovi odobrenja mreža.
- Sve što ovde ne piše, i kad korisnik traži čoveka.
`
