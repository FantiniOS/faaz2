"""
Normalização e tradução dos nomes técnicos de alimentos (TACO / TBCA / POF-IBGE / FRdoc Clínico)
para descrições visuais claras em inglês voltadas a fotografia de estúdio.

Proteções anti-colisão:
- Qualificadores ambíguos ('rio', 'extrato', 'da terra', 'de milho', 'pera', 'lima', etc.)
  só são aplicados quando o alimento base e a categoria correspondem exatamente.
- Regras contextuais utilizam regex de palavra inteira (\b) + categoria validada.
"""
import re
import unicodedata


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def _strip_parens(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\(.*?\)", "", s or "")).strip()


def _has_word(text: str, word: str) -> bool:
    return re.search(rf"\b{re.escape(word)}\b", text) is not None


def _has_any_word(text: str, words: tuple[str, ...]) -> bool:
    return any(_has_word(text, w) for w in words)


# =============================================================================
# 1. OVERRIDES EXATOS (chaves normalizadas sem parênteses)
# Inclui pratos regionais, itens clínicos específicos e correções das colisões antigas.
# =============================================================================
EXACT_OVERRIDES: dict[str, str] = {
    # --- Correções explícitas de colisões antigas ---
    "camarao, rio grande, grande, cozido": "large cooked boiled pink-orange marine shrimp with curled tails",
    "camarao, rio grande, grande, cru": "large fresh raw translucent grey-pink marine shrimp",
    "risoto de camarao com limao siciliano": "creamy glossy Italian arborio risotto topped with plump cooked pink shrimp, bright yellow Sicilian lemon zest curls, and fresh chopped parsley",
    "soja, extrato soluvel, natural, fluido": "plain creamy white soy milk in a small clean clear glass",
    "soja, extrato soluvel, po": "fine pale cream soy milk powder mound",
    "banana, da terra, crua": "large ripe yellow-and-black speckled plantain bananas (banana da terra)",
    "banana da terra cozida ou grelhada": "golden pan-grilled sliced yellow plantain (banana da terra) with light caramelized edges",
    "oleo, de milho": "clear pale-golden corn vegetable cooking oil in a small clear glass bowl",
    "laranja, da terra, crua": "fresh whole textured bitter Seville orange fruit, one halved",
    "laranja, da terra, suco": "fresh bitter orange juice in a small clean clear glass",
    "mexerica, rio, crua": "small aromatic ripe green-and-orange Brazilian Rio tangerine, one peeled showing segments",
    "tomate, extrato": "thick deep-red concentrated tomato paste in a small white porcelain ramekin",
    "tomate, pure": "smooth rich red tomato puree in a small white porcelain ramekin",
    "tomate, salada": "fresh ripe red sliced salad tomatoes",
    "tomate, molho industrializado": "smooth rich red tomato sauce in a small white porcelain ramekin",

    # --- Pratos completos / regionais TACO ---
    "abobora, cabotian, cozida": "cooked bright-orange Japanese kabocha squash wedges with dark green skin edge, tender steamed texture",
    "abobora, cabotian, crua": "fresh raw halved Japanese kabocha squash with dark green ribbed skin and bright orange flesh",
    "arroz carreteiro": "Brazilian arroz carreteiro, seasoned rice cooked with shredded sun-dried beef, diced onions, and fresh chopped parsley",
    "pupunha, cozida": "boiled bright orange-yellow oval peach palm fruits (pupunha), one whole and one halved showing creamy starchy flesh",
    "palmito, pupunha, em conserva": "clean white cylindrical sliced hearts of palm (palmito)",
    "pao, de queijo, assado": "three small round golden-tan baked Brazilian cheese bread balls (pao de queijo), smooth baked tapioca dough spheres with light golden spots",
    "pao, de queijo, cru": "unbaked pale round Brazilian cheese bread dough balls arranged neatly",
    "carne, bovina, acem, moido, cru": "fresh raw red ground beef chuck pile with natural fine marbling and texture",
    "carne, bovina, acem, moido, cozido": "cooked browned ground beef chuck crumbles",
    "mandioca, farofa, temperada": "toasted golden Brazilian farofa made from seasoned cassava flour with toasted crumbs and herbs",
    "tapioca, com manteiga": "folded white Brazilian tapioca flatbread crepe brushed with melted golden butter",
    "feijao carioca cozido": "cooked Brazilian pinto beans (carioca beans) in thick light-brown savory broth",
    "feijao, carioca, cozido": "cooked Brazilian pinto beans (carioca beans) in thick light-brown savory broth",
    "feijao, carioca, cru": "dry raw speckled beige and brown pinto beans (carioca beans) pile",
    "acaraje": "golden deep-fried Brazilian black-eyed pea fritter (acaraje) split open with shrimp and creamy vatapa filling",
    "baiao de dois, arroz e feijao-de-corda": "Brazilian baiao de dois, rice cooked with black-eyed peas, diced coalho cheese, and fresh herbs",
    "barreado": "slow-cooked shredded Brazilian beef stew (barreado) with cassava flour",
    "bife a cavalo, com contra file": "pan-seared beef striploin steak topped with a sunny-side-up fried egg",
    "bolinho de arroz": "crispy golden fried Brazilian rice fritter balls",
    "camarao a baiana": "Brazilian shrimp stew in vibrant orange-red palm oil and coconut milk sauce",
    "charuto, de repolho": "rolled stuffed cabbage leaves filled with seasoned beef and rice",
    "cuscuz, de milho, cozido com sal": "steamed bright-yellow Brazilian cornmeal couscous wedge",
    "cuscuz, paulista": "molded savory Brazilian cornmeal couscous cake studded with green peas, tomatoes, and boiled egg slice",
    "cuxa, molho": "vibrant green Brazilian cuxa herb and sesame sauce in a small white ramekin",
    "dobradinha": "Brazilian white bean and beef tripe stew with herbs",
    "estrogonofe de carne": "creamy Brazilian beef stroganoff with sliced beef and mushrooms in rich light-brown tomato cream sauce",
    "estrogonofe de frango": "creamy Brazilian chicken stroganoff with diced chicken breast and mushrooms in light creamy tomato sauce",
    "feijoada": "traditional Brazilian black bean stew (feijoada) with braised pork cuts and sliced sausage",
    "feijao tropeiro mineiro": "Brazilian feijao tropeiro, pinto beans tossed with toasted cassava flour, chopped collard greens, bacon, and egg",
    "frango, com acafrao": "golden turmeric-braised chicken pieces in warm yellow sauce",
    "macarrao, molho bolognesa": "spaghetti pasta topped with rich red meat bolognese sauce",
    "manicoba": "dark green slow-simmered Amazonian manicoba stew with braised pork and sausage",
    "quibebe": "creamy golden mashed pumpkin stew seasoned with fresh herbs",
    "salada, de legumes, com maionese": "Brazilian diced potato salad with carrots, green peas, and creamy mayonnaise",
    "salada, de legumes, cozida no vapor": "steamed colorful diced vegetable medley with carrots, green beans, and zucchini",
    "salpicao, de frango": "creamy Brazilian shredded chicken salad with grated carrots, sweet corn, and crispy potato sticks",
    "sarapatel": "dark spiced Brazilian pork stew (sarapatel) with herbs",
    "tabule": "fresh tabbouleh salad with finely chopped parsley, diced tomatoes, mint, and bulgur wheat",
    "tacaca": "golden yellow Amazonian tucupi broth with jambu leaves and pink shrimp in a small white bowl",
    "tucupi, com pimenta-de-cheiro": "golden yellow fermented cassava tucupi broth with small yellow aromatic chili peppers",
    "vaca atolada": "braised beef ribs stewed with tender chunks of cassava root",
    "vatapa": "creamy golden-orange Brazilian vatapa paste made with coconut milk, peanuts, and palm oil",
    "virado a paulista": "Brazilian virado a paulista dish with mashed beans, pork chop, fried egg, and collard greens",
    "yakisoba": "stir-fried yakisoba wheat noodles with sliced beef, broccoli, carrots, and cabbage",
    "coxinha de frango, frita": "golden crispy teardrop-shaped Brazilian fried chicken croquette (coxinha)",
    "croquete, de carne, cru": "raw breaded cylindrical beef croquettes",
    "croquete, de carne, frito": "golden crispy fried cylindrical beef croquettes",
    "empada de frango, pre-cozida, assada": "golden baked mini Brazilian savory chicken pie (empada)",
    "empada, de frango, pre-cozida": "golden mini Brazilian savory chicken pie (empada)",
    "quibe, assado": "baked diamond-scored beef and bulgur wheat kibbeh slice",
    "quibe, cru": "fresh raw spiced beef and bulgur kibbeh tartar",
    "quibe, frito": "crispy golden fried torpedo-shaped beef and bulgur kibbeh croquettes",
    "pastel, de carne, cru": "uncooked folded rectangular raw Brazilian pastry pocket",
    "pastel, de carne, frito": "crispy golden deep-fried rectangular Brazilian beef pastry (pastel)",
    "pastel, de queijo, cru": "uncooked folded rectangular raw Brazilian cheese pastry pocket",
    "pastel, de queijo, frito": "crispy golden deep-fried rectangular Brazilian cheese pastry (pastel)",
    "pastel, massa, crua": "rolled fresh raw thin pastry dough sheet",
    "pastel, massa, frita": "crispy golden fried puffy pastry dough squares",
    "pamonha, barra para cozimento, pre-cozida": "traditional steamed golden sweet corn pamonha wrapped in green corn husk",
    "curau, milho verde": "creamy smooth golden sweet corn pudding dusted with cinnamon",
    "curau, milho verde, mistura para": "pale yellow dry sweet corn pudding powder pile",
    "polenta, pre-cozida": "smooth golden cooked yellow cornmeal polenta",
    "nhoque, batata, cozido": "cooked soft pillowy potato gnocchi dumplings",
    "cocada branca": "white shredded coconut fudge squares (cocada branca)",
    "doce, de abobora, cremoso": "glossy deep-orange creamy caramelized pumpkin preserve",
    "doce, de leite, cremoso": "smooth caramel-colored creamy dulce de leche spoonful",
    "geleia, mocoto, natural": "translucent pale amber firm jelly cubes",
    "maria mole": "fluffy white coconut-dusted marshmallow squares",
    "maria mole, coco queimado": "fluffy marshmallow squares coated in toasted dark-golden coconut flakes",
    "quindim": "glossy bright-yellow baked Brazilian coconut custard tart (quindim)",
    "rapadura": "rustic brown solid block of unrefined cane sugar (rapadura)",
    "pacoca, amendoim": "cylindrical crumbly Brazilian peanut candy (pacoca)",
    "pe-de-moleque, amendoim": "crunchy caramelized brown sugar and roasted whole peanut brittle square",
    "pinhao, cozido": "boiled dark-brown Araucaria pine nuts, one peeled showing creamy beige kernel",
    "biscoito, polvilho doce": "light airy crisp ring-shaped Brazilian tapioca starch biscuits (biscoito de polvilho)",
    "canjica, branca, crua": "raw dry white hominy corn kernels pile",
    "canjica, com leite integral": "creamy sweet white hominy corn pudding simmered in milk with cinnamon",
    "ovo, de galinha, clara, cozida/10minutos": "boiled egg whites sliced cleanly",
    "ovo, de galinha, gema, cozida/10minutos": "cooked bright yellow boiled egg yolks",
    "ovo, de galinha, inteiro, cozido/10minutos": "hard-boiled chicken egg peeled and halved showing yolk and white",
    "ovo de galinha cozido": "hard-boiled chicken egg peeled and halved showing yolk and white",
    "ovo, de galinha, inteiro, cru": "whole fresh brown and white raw chicken eggs",
    "ovo, de galinha, inteiro, frito": "sunny-side-up fried chicken egg with crisp edge and bright yellow yolk",
    "ovo, de codorna, inteiro, cru": "small speckled raw quail eggs",
    "omelete, de queijo": "folded golden fluffy cheese omelet",
    "whey protein concentrado 80%": "creamy vanilla whey protein powder mound with natural fine texture",
    "whey protein isolado 90%": "fine pale cream whey protein isolate powder mound",
    "whey protein hidrolisado em po": "ultra-fine pale ivory hydrolyzed whey protein powder mound",
    "albumina em po pura": "fine pale yellow-cream egg white albumin powder mound",
    "creatina monoidratada pura": "pure fine crystalline white creatine powder mound",
    "psyllium puro em fibras": "light tan flaky natural psyllium husk fiber mound",
    "cana, aguardente 1": "clear sugarcane spirit (cachaca) in a small clean crystal shot glass",
    "cana, caldo de": "freshly pressed frothy pale green-yellow sugarcane juice in a clear glass",
    "coco, agua de": "clear refreshing coconut water in a small clear glass beside a green coconut",
    "shoyu": "dark glossy soy sauce in a small white porcelain dipping dish",
    "caldo de carne, tablete": "compact brown beef bouillon cube",
    "caldo de galinha, tablete": "compact golden-yellow chicken bouillon cube",
    "fermento, biologico, levedura, tablete": "crumbled beige fresh baker yeast block",
    "fermento em po, quimico": "fine white baking powder mound",
    "tempero a base de sal": "coarse savory seasoned salt blend with dried herbs",
    "soja, queijo": "firm fresh white tofu block cut into neat cubes",
    "arroz branco cozido": "fluffy cooked white rice grains mound",
    "aveia em flocos": "raw whole rolled oat flakes pile",
    "banana prata": "fresh ripe yellow prata bananas",
    "maca fuji com casca": "crisp red-and-yellow striped Fuji apple, one whole and one sliced",
    "mamao verde, doce em calda, drenado": "candied translucent green papaya shreds in light glossy syrup",
    "corvina de agua doce, crua": "fresh raw whole freshwater croaker fish",
    "corvina do mar, crua": "fresh raw whole silver sea croaker fish",
    "dourada de agua doce, fresca": "fresh whole golden freshwater dorado fish",
    "cereais, mistura para vitamina, trigo, cevada e aveia": "multi-grain wheat, barley and oat cereal powder blend mound",
    "lasanha, massa fresca, cozida": "cooked soft tender rectangular sheets of fresh lasagna pasta",
    "lasanha, massa fresca, crua": "fresh raw pale yellow sheets of lasagna pasta",
    "milho, verde, enlatado, drenado": "drained bright yellow sweet corn kernels pile",
    "pipoca, com oleo de soja, sem sal": "fluffy popped white popcorn pile",
    "chocolate, ao leite, com castanha do para": "milk chocolate bar squares studded with chopped Brazil nuts",
    "bolo, pronto, aipim": "moist golden baked Brazilian cassava cake slice (bolo de aipim)",

    # --- Itens clínicos modernos & pratos icônicos da expansão ---
    "pasta de amendoim integral sem acucar": "smooth creamy golden-brown natural peanut butter swirl in a small white porcelain bowl",
    "pasta de amendoim crocante sem acucar": "chunky crunchy roasted peanut butter with visible peanut pieces in a small white bowl",
    "pasta de amendoim com cacau zero acucar": "rich dark chocolate cocoa peanut butter swirl in a small white porcelain bowl",
    "pasta de amendoim com whey protein": "thick smooth creamy high-protein peanut butter in a small white bowl",
    "pasta de castanha-de-caju integral": "silky pale ivory cashew nut butter in a small white porcelain bowl",
    "pasta de amendoas integral": "rich roasted almond butter with natural flecks in a small white porcelain bowl",
    "pasta de avela com cacau zero acucar": "glossy dark chocolate hazelnut spread swirl in a small white porcelain bowl",
    "tahine / pasta de gergelim integral": "smooth silky beige sesame tahini paste in a small white porcelain bowl",
    "queijo cottage tradicional": "fresh white creamy curdled cottage cheese in a small white bowl",
    "queijo cottage zero lactose": "fresh white creamy curdled cottage cheese in a small white bowl",
    "queijo cottage desnatado 0% gordura": "fresh bright-white low-fat cottage cheese curds in a small white bowl",
    "requeijao cremoso light": "smooth glossy white Brazilian creamy requeijao spread in a small white ramekin",
    "requeijao cremoso zero gordura": "smooth light white Brazilian creamy requeijao spread in a small white ramekin",
    "requeijao cremoso tradicional": "rich creamy white Brazilian requeijao cheese spread in a small white ramekin",
    "cream cheese light": "soft smooth white spreadable cream cheese scoop in a small white ramekin",
    "cream cheese tradicional": "thick rich smooth white cream cheese block and creamy spread",
    "creme de ricota light": "fluffy smooth whipped white ricotta cheese cream in a small white ramekin",
    "creme de ricota tradicional": "creamy whipped white ricotta cheese spread in a small white ramekin",
    "iogurte grego natural zero acucar": "thick velvety white Greek yogurt swirl in a small white bowl",
    "iogurte grego tradicional integral": "thick creamy Greek yogurt swirl in a small white bowl",
    "iogurte grego natural integral sem acucar": "rich thick spoonable white Greek yogurt in a small white bowl",
    "iogurte tipo skyr natural sem acucar": "ultra-thick dense smooth white Icelandic Skyr yogurt in a small white bowl",
    "iogurte proteico zero lactose 15g proteina": "thick creamy white high-protein yogurt in a small white bowl",
    "kefir de leite integral natural": "smooth pourable white fermented kefir milk in a small clear glass",
    "kefir de leite desnatado natural": "light smooth white fermented kefir milk in a small clear glass",
    "coalhada seca arabe / labneh": "thick creamy Middle Eastern strained labneh yogurt cheese drizzled lightly in a small white bowl",
    "coalhada fresca natural integral": "soft set white natural curdled milk yogurt in a small white bowl",
    "bebida proteica pronta tipo yopro 15g": "creamy chocolate-vanilla ready-to-drink protein shake in a clean small glass",
    "bebida proteica pronta tipo yopro 25g": "thick creamy high-protein milk shake in a clean small glass",
    "bebida proteica pronta whey pronto uht": "smooth creamy vanilla protein shake drink in a clean small glass",
    "leite vegetal de amendoas sem acucar": "creamy off-white almond milk in a small clear glass beside two whole almonds",
    "leite vegetal de aveia sem acucar": "smooth creamy pale oat milk in a small clear glass beside rolled oats",
    "leite vegetal de soja sem acucar": "smooth pale ivory soy milk in a small clear glass",
    "leite vegetal de coco pronto sem acucar": "pure white coconut milk beverage in a small clear glass",
    "leite vegetal de castanha-de-caju sem acucar": "creamy pale cashew milk in a small clear glass beside two cashew nuts",
    "tapioca hidratada, goma pronta": "fluffy snow-white hydrated Brazilian tapioca starch crumbs pile",
    "rap10 / wrap integral": "round soft whole-wheat flatbread tortilla wrap slightly folded",
    "rap10 / wrap tradicional": "round soft pale white flour flatbread tortilla wrap",
    "rap10 / wrap fit light": "thin round soft multigrain flatbread tortilla wrap",
    "pao sirio integral / pita integral": "round golden-brown whole-wheat Arabic pita flatbread",
    "pao sirio tradicional / pita": "round soft pale baked Arabic pita flatbread",
    "pao australiano": "dark mahogany-brown sliced Australian honey-molasses bread dusted with cornmeal",
    "pao low carb de amendoas e sementes": "dense golden-brown sliced low-carb almond flour bread topped with pumpkin and sunflower seeds",
    "pao proteico de graos": "thick slice of dark seeded high-protein whole-grain bread",
    "pao de fermentacao natural / sourdough": "crusty artisan sourdough bread slice with open airy crumb",
    "pao 100% integral de forma": "soft brown whole-wheat sliced sandwich bread",
    "pao integral com graos e castanhas": "sliced dark whole-grain bread studded with seeds and chopped nuts",
    "pao de centeio integral": "dense dark brown sliced rye bread",
    "pao de forma sem gluten": "soft golden-crust sliced gluten-free sandwich bread",
    "biscoito de arroz integral sem sal": "round crispy puffed brown rice cakes stacked slightly",
    "mini biscoito de arroz integral": "small round crispy puffed mini brown rice cakes pile",
    "granola sem acucar integral": "crunchy golden baked whole-grain oat granola clusters with seeds and nuts",
    "granola low carb de castanhas e sementes": "chunky toasted low-carb granola made of almonds, coconut chips, pumpkin and sunflower seeds",
    "granola tradicional com mel": "golden honey-toasted oat granola clusters with raisins and nuts",
    "semente de chia": "tiny speckled black and grey chia seeds pile",
    "semente de gergelim preto": "glossy jet-black sesame seeds pile",
    "semente de abobora torrada sem sal / pepita": "toasted green hulled pumpkin seeds (pepitas) pile",
    "semente de girassol torrada sem sal": "toasted pale grey-tan hulled sunflower seeds pile",
    "linhaca dourada em grao": "glossy golden-yellow flaxseeds pile",
    "farinha de linhaca dourada": "coarse golden-beige milled flaxseed meal mound",
    "farinha de linhaca marrom": "coarse warm-brown milled brown flaxseed meal mound",
    "farinha de amendoas": "fine pale cream blanched almond flour mound",
    "farinha de coco sem acucar": "soft fine white-ivory coconut flour mound",
    "farinha de aveia integral": "fine pale beige whole oat flour mound",
    "farelo de aveia": "textured pale golden oat bran flakes mound",
    "aveia em flocos finos": "fine rolled quick oat flakes mound",
    "quinoa em grao cozida": "fluffy cooked pale ivory quinoa grains mound showing delicate spiral germ",
    "quinoa em grao crua": "dry raw pale ivory tiny round quinoa seeds pile",
    "quinoa em flocos": "light pale beige rolled quinoa flakes mound",
    "amaranto em flocos": "fine pale golden popped amaranth flakes mound",
    "grao-de-bico cozido drenado": "tender cooked plump golden-beige chickpeas mound",
    "grao-de-bico crocante assado na airfryer": "crispy golden-brown roasted spiced chickpeas pile",
    "edamame / soja verde cozida sem vagem": "bright vibrant green shelled cooked edamame soybeans pile",
    "homus / pasta de grao-de-bico tradicional": "creamy smooth beige chickpea hummus swirled in a small white bowl with a drop of olive oil and paprika",
    "guacamole caseiro natural": "fresh chunky vibrant green mashed avocado guacamole with diced tomato and cilantro in a small white bowl",
    "avocado / abacate hass cru": "fresh Hass avocado with dark pebbled skin, halved showing bright green buttery flesh and brown pit",
    "mirtilo / blueberry fresco": "plump dusty-blue fresh blueberries pile",
    "framboesa fresca": "vibrant ruby-red fresh raspberries pile",
    "amora fresca": "glossy deep purple-black fresh blackberries pile",
    "frutas vermelhas congeladas mix": "colorful mix of fresh strawberries, blueberries, raspberries, and blackberries",
    "melao cantaloupe fresco": "juicy bright-orange cantaloupe melon wedges with netted rind",
    "pitaya / fruta-do-dragao fresca": "vibrant magenta dragon fruit (pitaya) halved showing white flesh speckled with tiny black seeds",
    "lichia fresca sem casca": "translucent pearly-white peeled fresh lychee fruit beside one with bumpy red shell",
    "cereja fresca": "glossy deep-red fresh sweet cherries with green stems",
    "tamara seca sem caroco": "glossy chewy dark-brown pitted Medjool dates",
    "damasco seco desidratado": "vibrant golden-orange soft dried apricots",
    "uva passa escura sem semente": "dark wrinkled sweet seedless raisins pile",
    "ameixa seca sem caroco": "glossy dark purple-black soft dried pitted prunes",
    "cranberry desidratado sem acucar": "ruby-red soft dried cranberries pile",
    "banana-passa desidratada sem acucar": "chewy dark amber-brown whole dried banana",
    "figo seco turco": "chewy golden-tan dried Turkish figs, one halved showing seeds",
    "goji berry desidratada": "vibrant red-orange dried goji berries pile",
    "chocolate amargo 70% cacau": "rich dark 70% cocoa chocolate bar squares with matte satin finish",
    "chocolate amargo 85% cacau": "deep extra-dark 85% cocoa chocolate bar squares",
    "chocolate amargo 70% cacau zero acucar": "rich dark sugar-free 70% cocoa chocolate squares",
    "cacau em po 100% alcalino sem acucar": "velvety deep dark-brown pure unsweetened cocoa powder mound",
    "nibs de cacau puro": "crunchy dark roasted crushed cacao nibs pile",
    "xilitol adocante natural em po": "sparkling fine white crystalline xylitol sweetener mound",
    "eritritol adocante natural em po": "fine white crystalline erythritol sweetener mound",
    "stevia adocante natural em gotas ou po": "fine pure white stevia sweetener powder mound beside a fresh green stevia leaf",
    "sucralose adocante em gotas": "clear liquid sweetener drop from a clean glass dropper",
    "oleo de coco extra virgem": "creamy snow-white solid virgin coconut oil scoop in a small clear glass bowl",
    "oleo de abacate extra virgem": "emerald-green extra virgin avocado oil in a small clear glass bowl",
    "manteiga ghee clarificada": "rich golden amber clarified ghee butter in a small white porcelain ramekin",
    "oleo tcm / mct puro": "crystal-clear pure MCT oil in a small clear glass bowl",
    "tilapia, file, cru": "fresh raw translucent white-pink tilapia fish fillet",
    "tilapia, file, grelhado": "golden char-grilled white tilapia fish fillet with clean grill marks",
    "tilapia, file, assado no forno": "tender oven-baked white tilapia fish fillet with golden edges and herbs",
    "atum solido em agua drenado": "clean pale pink flaked solid canned tuna drained neatly",
    "atum ralado em agua drenado": "light pink finely shredded drained tuna pile",
    "atum fresco selado / grelhado": "seared sesame-edge fresh tuna steak sliced showing rosy pink center",
    "salmao defumado fatiado": "silky translucent orange-pink cold-smoked salmon slices rolled neatly",
    "salmao, file, assado no forno": "flaky golden oven-baked pink salmon fillet with crisp edge",
    "camarao cinza grelhado sem casca": "char-grilled peeled pink shrimp with light sear marks",
    "patinho bovino moido refogado / cozido": "lean browned cooked ground beef crumbles with light herbs",
    "file mignon suino grelhado": "juicy seared lean pork tenderloin medallions with golden crust",
    "file mignon suino cru": "fresh raw trimmed pale pink pork tenderloin fillet",
    "peito de frango desfiado cozido": "tender shredded cooked white chicken breast pile",
    "sobrecoxa de frango desossada sem pele na airfryer": "golden crispy air-fried boneless skinless chicken thigh",
    "sassami / filezinho de frango grelhado": "golden char-grilled lean chicken breast tenderloins",
    "peito de peru defumado fatiado": "neatly folded thin pale slices of smoked turkey breast",
    "blanquet de peru fatiado": "neatly folded thin slices of light roasted turkey breast",
    "lombo canadense fatiado": "thin round slices of pink lean smoked Canadian pork loin",
    "presunto de parma / presunto cru": "delicate paper-thin folded slices of cured Parma prosciutto ham",
    "ovo mexido simples sem oleo": "fluffy soft golden-yellow scrambled eggs mound",
    "ovo poche": "delicate round poached egg with glossy white exterior and golden yolk peeking",
    "clara de ovo pasteurizada liquida": "translucent clear liquid egg whites in a small clean glass",
    "omelete simples de 2 ovos": "folded tender golden-yellow plain egg omelet",
    "omelete de claras com ervas": "folded fluffy white egg-white omelet flecked with green herbs",
    "ovo de codorna cozido": "peeled small white hard-boiled quail eggs, one halved showing yellow yolk",
    "cogumelo shimeji refogado": "sauteed glossy brown beech shimeji mushroom clusters",
    "cogumelo shitake refogado": "sauteed sliced rich dark-brown shiitake mushrooms",
    "cogumelo champignon / paris fatiado fresco": "fresh raw sliced white button mushrooms",
    "cogumelo portobello grelhado": "large char-grilled dark meaty portobello mushroom cap",
    "aspargos frescos grelhados ou cozidos": "tender bright green roasted asparagus spears neatly bundled",
    "couve-de-bruxelas assada ou cozida": "halved roasted green Brussels sprouts with lightly caramelized edges",
    "palmito pupunha fresco assado ou cozido": "roasted tender ivory fresh pupunha heart of palm halved lengthwise",
    "espaguete de palmito pupunha": "delicate white spiralized heart of palm spaghetti noodles nest",
    "abobora moranga assada no forno": "oven-roasted bright orange pumpkin wedges with caramelized edges",
    "abobora cabotia assada no forno": "oven-roasted bright orange kabocha squash wedges with dark green skin and caramelized edges",
    "batata-doce assada ou na airfryer": "golden caramelized air-fried sweet potato wedges with crispy edges",
    "batata inglesa rustica na airfryer": "crispy golden air-fried rustic skin-on potato wedges with herbs",
    "aipim / mandioca na airfryer sem oleo": "golden crispy air-fried Brazilian cassava sticks (mandioca)",
    "inhame cozido": "tender steamed white sliced taro yam rounds (inhame)",
    "tomate-cereja cru": "glossy bright-red fresh whole cherry tomatoes cluster",
    "arroz basmati cozido": "fluffy long slender cooked white basmati rice grains",
    "arroz negro cozido": "glossy deep purple-black cooked whole-grain black rice mound",
    "arroz 7 graos integral cozido": "colorful cooked seven-grain whole brown rice and seeds pilaf mound",
    "arroz vermelho cozido": "nutty cooked reddish-brown whole red rice mound",
    "macarrao integral cozido": "cooked al dente whole-wheat tan spaghetti pasta nest",
    "macarrao de grao-de-bico cozido": "cooked golden-yellow chickpea fusilli pasta mound",
    "macarrao de konjac / shirataki escorrido": "translucent white drained konjac shirataki noodles nest",
    "macarrao de arroz / bifum cozido": "delicate thin white cooked rice vermicelli noodles (bifum)",
    "cuscuz marroquino / semolina cozido": "fluffy golden cooked fine Moroccan semolina couscous mound",
    "barra de proteina tradicional 12g-15g prot.": "chocolate-coated chewy high-protein bar cut diagonally showing dense nougat center",
    "barra de proteina low carb 20g prot.": "dark chocolate-coated low-carb protein bar cut in half showing rich fudge center",
    "barra de nuts / castanhas sem acucar": "crunchy rectangular nut bar packed with whole almonds, peanuts, cashews and seeds",
    "proteina vegana de ervilha e arroz em po": "fine pale beige plant-based pea and rice protein powder mound",
    "caseina micelar em po": "fine creamy off-white micellar casein protein powder mound",
    "colageno hidrolisado em po sem sabor": "pure ultra-fine white hydrolyzed collagen peptide powder mound",
    "colageno verisol peptideos bioativos": "pure ultra-fine white collagen peptide powder mound",
    "glutamina l-glutamina pura em po": "pure sparkling white crystalline L-glutamine powder mound",
    "omega-3 oleo de peixe capsula": "two glossy translucent golden-amber omega-3 fish oil softgel capsules",
    "bcaa aminoacidos essenciais em po": "fine white crystalline BCAA amino acid powder mound",
    "palatinose / isomaltulose em po": "fine white crystalline palatinose carbohydrate powder mound",
    "maltodextrina em po": "fine snow-white maltodextrin powder mound",
    "gel de carboidrato esportivo": "translucent amber energy carbohydrate gel drop on a clean white surface",
    "spirulina em po": "vibrant deep blue-green fine spirulina algae powder mound",
    "chlorella em po": "intense rich emerald-green fine chlorella algae powder mound",
    "levedura nutricional / nutritional yeast": "golden-yellow savory nutritional yeast flakes mound",
    "maca peruana em po": "fine warm-tan Peruvian maca root powder mound",
    "inulina / fibra prebiotica soluvel em po": "fine pure white soluble inulin prebiotic fiber powder mound",
    "curcuma / acafrao-da-terra em po": "vibrant bright golden-orange ground turmeric powder mound",
    "canela em po pura": "warm reddish-brown fine ground cinnamon powder mound",
    "gengibre fresco ralado": "fresh pale-yellow grated ginger root pile beside a slice of ginger",
    "cafe expresso sem acucar": "rich dark Italian espresso coffee with golden crema in a small white porcelain espresso cup",
    "cafe coado sem acucar": "freshly brewed dark black filter coffee in a small clean glass cup",
    "matcha em po puro": "vibrant ceremonial bright-green fine Japanese matcha green tea powder mound",
    "cha verde infusao sem acucar": "clear pale yellow-green brewed green tea in a small clear glass cup",
    "cha de hibisco infusao sem acucar": "vibrant translucent ruby-red brewed hibiscus tea in a small clear glass cup",
    "cha de camomila infusao sem acucar": "clear golden-yellow brewed chamomile herbal tea in a small clear glass cup",
    "cha de hortela infusao sem acucar": "pale green-gold brewed fresh peppermint herbal tea in a small clear glass cup",
    "kombucha zero acucar": "sparkling golden-amber fermented kombucha tea with tiny bubbles in a clean small glass",
    "kombucha artesanal tradicional": "sparkling ruby-amber fermented kombucha tea in a clean small glass",
    "crepioca simples, 1 ovo e 2 col. tapioca": "folded golden-ivory Brazilian tapioca and egg crepe (crepioca)",
    "panqueca de banana com aveia e ovo": "two small golden-brown fluffy oat and banana pancakes stacked neatly",
    "mingau de aveia com leite desnatado": "warm creamy cooked oatmeal porridge in a small white porcelain bowl",
    "overnight oats com chia e iogurte": "creamy layered overnight oats with chia seeds and yogurt in a small clear glass jar",
    "pudim de chia com leite de amendoas": "creamy white chia seed pudding with speckled dark seeds in a small clear glass bowl",
    "molho pesto de manjericao caseiro": "vibrant green fresh basil pesto sauce with olive oil in a small white ramekin",
    "caldo de ossos natural / bone broth": "rich golden-amber clear bone broth in a small white porcelain bowl",
    "missoshiru / sopa de misso tradicional": "traditional Japanese miso soup with tiny tofu cubes and wakame seaweed in a small bowl",
    "misso pasta de soja fermentada": "rich amber-brown fermented soybean miso paste scoop in a small white ramekin",
    "chucrute / repolho fermentado drenado": "pale golden shredded fermented sauerkraut cabbage mound",
    "kimchi fermentado tradicional": "vibrant red spicy fermented Korean napa cabbage kimchi mound",
    "babaganoush / pasta de berinjela defumada com tahine": "creamy beige smoky roasted eggplant baba ganoush dip in a small white bowl",
    "ceviche de peixe branco classico": "fresh diced white fish ceviche cured in lime with red onion slices and cilantro",
    "poke havaiano de salmao com arroz, abacate e edamame": "fresh Hawaiian poke bowl with diced raw salmon, avocado slices, green edamame, and white rice",
    "shakshuka / ovos cozidos no molho de tomate": "poached eggs nestled in rich red spiced tomato pepper sauce with fresh herbs",
    "sunomono / salada agridoce de pepino japones": "thinly sliced crisp green Japanese cucumber salad topped with sesame seeds",
    "broto de feijao / moyashi refogado": "lightly stir-fried crisp white mung bean sprouts (moyashi)",
    "vinho tinto seco": "deep ruby-red dry red wine in a small crystal wine glass",
    "vinho branco seco": "pale straw-gold dry white wine in a small crystal wine glass",
    "espumante brut": "sparkling pale-gold brut champagne with fine bubbles in a small crystal flute glass",
    "alho-poro refogado": "lightly sauteed tender pale-green and white sliced leek rings",
    "arroz, doce cremoso com canela": "creamy sweet Brazilian rice pudding dusted with ground cinnamon in a small white bowl",
    "casquinha de siri assada": "golden gratinated Brazilian stuffed crab meat in a clean scallop shell (casquinha de siri)",
    "mandioca cozida na manteiga": "tender golden-yellow boiled Brazilian cassava chunks glistening with melted butter and parsley",
    "polenta, frita em palitos": "crispy golden deep-fried yellow cornmeal polenta sticks stacked neatly",
    "pao, de alho assado": "golden toasted garlic herb bread baguette slices with melted butter",
    "pao, na chapa com manteiga": "golden butter-griddled sliced Brazilian French bread roll halves",
    "trigo para quibe hidratado cozido": "fluffy cooked nutty light-brown bulgur wheat grains mound",
    "seriguela / ciriguela, polpa": "smooth bright orange-yellow tropical ciriguela fruit puree in a small white bowl",
    "sufle de legumes / chuchu ou espinafre": "golden puffed baked vegetable souffle in a small white porcelain ramekin",
}


# =============================================================================
# 2. TRADUÇÕES CONTEXTUAIS POR CATEGORIA + PALAVRA INTEIRA (ZERO COLISÕES)
# Executado quando não há override exato, antes do fallback genérico por vírgulas.
# =============================================================================
def _match_clinical_and_tbca_rules(norm: str, cat_norm: str) -> str | None:
    is_meat = "carne" in cat_norm
    is_fish = "pescado" in cat_norm
    is_dairy = "leite" in cat_norm
    is_fruit = "fruta" in cat_norm
    is_veg = "verdura" in cat_norm or "hortalica" in cat_norm
    is_cereal = "cereal" in cat_norm or "cereais" in cat_norm
    is_legume = "leguminosa" in cat_norm
    is_bev = "bebida" in cat_norm
    is_sweet = "acucarado" in cat_norm
    is_oil = "gordura" in cat_norm or "oleo" in cat_norm
    is_nut = "noze" in cat_norm or "semente" in cat_norm
    is_egg = "ovo" in cat_norm
    is_prep = "preparado" in cat_norm
    is_supp = "suplemento" in cat_norm
    is_misc = "miscelanea" in cat_norm or "industrializado" in cat_norm

    # --- Laticínios & Queijos ---
    if is_dairy:
        if _has_word(norm, "queijo") or _has_word(norm, "ricota"):
            if _has_word(norm, "cottage"):
                return "fresh creamy white cottage cheese curds in a small white bowl"
            if _has_word(norm, "coalho"):
                return "golden grilled rectangular skewer of Brazilian coalho cheese with grill marks"
            if _has_word(norm, "brie"):
                return "soft creamy French Brie cheese wedge with white bloomy rind"
            if _has_word(norm, "gorgonzola") or _has_word(norm, "roquefort"):
                return "creamy ivory blue cheese wedge veined with blue-green mold"
            if _has_word(norm, "bufala"):
                return "glossy round fresh white buffalo mozzarella balls"
            if _has_word(norm, "burrata"):
                return "fresh round white Italian burrata cheese ball slightly opened showing creamy stracciatella"
            if _has_word(norm, "canastra") or _has_word(norm, "minas padrao") or _has_word(norm, "reino"):
                return "aged golden-yellow Brazilian artisan cheese wedge"
            if _has_word(norm, "provolone"):
                return "firm pale golden smoked provolone cheese wedge"
            if _has_word(norm, "gouda") or _has_word(norm, "gruyere") or _has_word(norm, "emmental") or _has_word(norm, "suico"):
                return "smooth pale yellow European semi-hard cheese wedge"
            if _has_word(norm, "cheddar"):
                return "rich orange-yellow natural cheddar cheese slices"
            if _has_word(norm, "feta"):
                return "crumbly bright white Greek feta cheese cubes"
            if _has_word(norm, "mascarpone"):
                return "thick velvety off-white Italian mascarpone cream in a small white ramekin"
            if _has_word(norm, "halloumi"):
                return "golden pan-grilled white halloumi cheese slices with sear marks"
            if _has_word(norm, "parmesao") and _has_word(norm, "ralado"):
                return "finely grated pale golden parmesan cheese mound"
            if _has_word(norm, "catupiry"):
                return "creamy smooth off-white Brazilian Catupiry spreadable cheese swirl in a small white ramekin"
            if _has_word(norm, "polenguinho"):
                return "small rectangular creamy pale processed cheese block"
            if _has_word(norm, "manteiga"):
                return "rich yellow soft Brazilian butter cheese slice (queijo de manteiga)"
            if _has_word(norm, "ricota") and _has_word(norm, "defumada"):
                return "firm golden-brown crusted smoked ricotta cheese wedge"
            if _has_word(norm, "mucarela") or _has_word(norm, "mozarela"):
                return "neatly folded pale ivory mozzarella cheese slices"
            if _has_word(norm, "minas") and _has_word(norm, "frescal"):
                return "fresh soft white Brazilian Minas cheese slice"
            if _has_word(norm, "prato"):
                return "sliced golden-yellow Brazilian prato cheese"
        if _has_word(norm, "iogurte"):
            if _has_word(norm, "vermelhas") or _has_word(norm, "morango"):
                return "smooth creamy pink berry yogurt in a small white bowl"
            if _has_word(norm, "mel"):
                return "creamy white yogurt drizzled with golden honey in a small white bowl"
            return "smooth creamy plain white yogurt in a small white bowl"
        if _has_word(norm, "leite"):
            if _has_word(norm, "po"):
                return "fine creamy off-white powdered milk mound"
            if _has_word(norm, "condensado"):
                return "thick glossy pale cream sweetened condensed milk in a small white bowl"
            if _has_word(norm, "evaporado"):
                return "rich creamy pale beige evaporated milk in a small clear glass"
            return "fresh pure white milk in a small clean clear glass"
        if _has_word(norm, "nata") or _has_word(norm, "creme de leite"):
            return "smooth thick white dairy cream in a small white porcelain ramekin"
        if _has_word(norm, "bebida lactea") or _has_word(norm, "yakult"):
            return "small glass of pale ivory fermented probiotic milk drink"

    # --- Bebidas ---
    if is_bev:
        if _has_word(norm, "cha"):
            if _has_word(norm, "hibisco"):
                return "clear vibrant ruby-red brewed hibiscus tea in a small clear glass cup"
            if _has_word(norm, "verde") or _has_word(norm, "branco") or _has_word(norm, "hortela") or _has_word(norm, "boldo") or _has_word(norm, "cavalinha") or _has_word(norm, "carqueja") or _has_word(norm, "cidreira"):
                return "clear pale yellow-green brewed herbal tea in a small clear glass cup"
            if _has_word(norm, "mate") and _has_word(norm, "gelado"):
                return "chilled clear amber iced mate tea with ice cubes in a clean glass"
            return "clear warm amber brewed herbal tea in a small clear glass cup"
        if _has_word(norm, "suco"):
            if _has_word(norm, "verde") or _has_word(norm, "detox"):
                return "vibrant fresh emerald-green detox vegetable juice in a clean small glass"
            if _has_word(norm, "uva"):
                return "deep dark purple natural grape juice in a clean small glass"
            if _has_word(norm, "cranberry"):
                return "bright translucent ruby-red cranberry juice in a clean small glass"
            if _has_word(norm, "beterraba"):
                return "intense deep crimson beetroot and orange juice in a clean small glass"
            if _has_word(norm, "cenoura"):
                return "bright vibrant orange fresh carrot juice in a clean small glass"
            if _has_word(norm, "tomate"):
                return "rich red fresh tomato juice in a clean small glass"
            if _has_word(norm, "melancia") or _has_word(norm, "morango"):
                return "fresh bright-red fruit juice in a clean small glass"
            if _has_word(norm, "laranja") or _has_word(norm, "tangerina") or _has_word(norm, "manga") or _has_word(norm, "maracuja") or _has_word(norm, "acerola"):
                return "bright golden-orange fresh citrus tropical fruit juice in a clean small glass"
            if _has_word(norm, "abacaxi") or _has_word(norm, "caju") or _has_word(norm, "maca") or _has_word(norm, "limao"):
                return "refreshing pale golden-yellow fresh fruit juice in a clean small glass"
            if _has_word(norm, "melao"):
                return "refreshing pale pastel-green fresh melon juice with mint leaf in a clean small glass"
            if _has_word(norm, "goiaba"):
                return "creamy vibrant pink fresh guava juice in a clean small glass"
            return "fresh natural fruit juice in a clean small glass"
        if _has_word(norm, "vitamina") or _has_word(norm, "smoothie") or _has_word(norm, "shake"):
            if _has_word(norm, "abacate"):
                return "creamy smooth pastel-green avocado milk smoothie in a small clear glass"
            if _has_word(norm, "vermelhas"):
                return "thick vibrant berry-purple fruit smoothie in a small clear glass"
            if _has_word(norm, "manga") or _has_word(norm, "maracuja"):
                return "thick sunny golden mango passionfruit smoothie in a small clear glass"
            return "thick creamy banana oat protein smoothie in a small clear glass"
        if _has_word(norm, "cafe") or _has_word(norm, "cappuccino"):
            if _has_word(norm, "leite") or _has_word(norm, "cappuccino"):
                return "creamy light-brown cafe au lait cappuccino with microfoam in a small white cup"
            return "rich dark black brewed coffee in a small clean glass cup"
        if _has_word(norm, "chocolate quente"):
            return "rich dark creamy hot chocolate in a small white ceramic cup"
        if _has_word(norm, "limonada"):
            return "refreshing frothy pale-green Brazilian limeade in a clean glass"
        if _has_word(norm, "agua") and _has_word(norm, "coco"):
            return "crystal-clear coconut water in a small clean glass"
        if _has_word(norm, "agua"):
            return "crystal-clear sparkling water with tiny bubbles and a lime wedge in a clean glass"
        if _has_word(norm, "cerveja") or _has_word(norm, "chopp"):
            return "chilled golden beer with crisp white foam head in a small clean glass"
        if _has_word(norm, "energetico"):
            return "chilled bright amber sparkling energy drink in a small clear glass"
        if _has_word(norm, "caipirinha"):
            return "traditional Brazilian lime caipirinha with muddled green lime wedges and ice in a short clear glass"
        if _has_word(norm, "gin tonica"):
            return "crystal-clear gin and tonic cocktail with ice and green lime slice in a clean glass"
        if _has_any_word(norm, ("gin", "vodka")):
            return "crystal-clear distilled spirit in a small clean crystal glass"
        if _has_word(norm, "uisque"):
            return "rich amber whiskey in a small clean crystal rocks glass"
        if _has_word(norm, "refrigerante"):
            if _has_word(norm, "cola"):
                return "chilled dark caramel cola soda with bubbles in a small clear glass"
            if _has_word(norm, "guarana"):
                return "chilled amber sparkling guarana soda in a small clear glass"
            return "chilled sparkling soda in a small clear glass"

    # --- Pescados & Frutos do Mar ---
    if is_fish:
        if _has_word(norm, "sashimi"):
            if _has_word(norm, "salmao"):
                return "neatly arranged fresh raw bright-orange sliced salmon sashimi pieces"
            if _has_word(norm, "atum"):
                return "neatly arranged fresh raw deep-red sliced tuna sashimi pieces"
            return "neatly arranged fresh raw translucent white fish sashimi slices"
        if _has_word(norm, "lula"):
            if _has_word(norm, "frita") or _has_word(norm, "dore"):
                return "golden crispy deep-fried breaded calamari squid rings"
            return "tender cooked white squid calamari rings with light grill marks"
        if _has_word(norm, "polvo"):
            return "tender grilled purple-white octopus tentacles sliced cleanly"
        if _has_word(norm, "mexilhao") or _has_word(norm, "marisco"):
            return "steamed plump orange mussels in glossy dark open shells"
        if _has_word(norm, "ostra"):
            return "fresh raw glistening oyster on the half shell"
        if _has_word(norm, "vieira"):
            return "golden pan-seared round white sea scallops"
        if _has_word(norm, "lagosta"):
            return "steamed bright-red lobster tail halved showing tender white meat"
        if _has_word(norm, "siri"):
            return "flaky cooked white shredded crab meat mound"
        if _has_word(norm, "kani"):
            return "red-and-white cylindrical Japanese surimi crab sticks"
        if _has_word(norm, "camarao"):
            if _has_word(norm, "alho"):
                return "golden sauteed pink shrimp tossed with browned garlic and parsley"
            if _has_word(norm, "grelhado"):
                return "char-grilled peeled pink shrimp with light sear marks"
            if _has_word(norm, "cozido"):
                return "cooked boiled bright pink peeled shrimp"
            return "fresh raw translucent pink-grey shrimp"
        if _has_word(norm, "sardinha") and _has_word(norm, "tomate"):
            return "silver canned sardines coated in rich red tomato sauce"
        if _has_word(norm, "arenque"):
            return "glossy silver pickled herring fillets"
        if _has_word(norm, "bacalhau"):
            return "flaky white cooked salted codfish fillet chunks"
        if _has_word(norm, "truta"):
            return "golden pan-grilled pink-fleshed trout fish fillet"
        if _has_word(norm, "cacao") and _has_word(norm, "moqueca"):
            return "simmered white fish steak in light orange tomato and herb stew sauce"
        if _has_any_word(norm, ("robalo", "badejo", "namorado", "linguado", "panga", "pescada", "merluza", "cavala", "anchova", "enchova", "tainha", "tambaqui", "pirarucu", "pacu", "dourado")):
            if _has_word(norm, "cru") or _has_word(norm, "crua"):
                return "fresh raw clean white fish fillet"
            if _has_word(norm, "assado") or _has_word(norm, "assada"):
                return "golden oven-roasted flaky white fish fillet with light herbs"
            if _has_word(norm, "grelhado") or _has_word(norm, "grelhada"):
                return "char-grilled golden-edged white fish fillet with sear marks"
            return "tender cooked white fish fillet"

    # --- Carnes, Aves, Suínos & Cordeiro ---
    if is_meat:
        if _has_word(norm, "bacon"):
            if _has_word(norm, "cru"):
                return "fresh raw striped pink-and-white pork bacon strips"
            return "crispy golden-brown pan-fried pork bacon strips"
        if _has_word(norm, "torresmo"):
            return "golden ultra-crispy fried Brazilian pork belly cracklings (torresmo)"
        if _has_word(norm, "kafta"):
            return "char-grilled cylindrical spiced ground beef kafta kebab"
        if _has_word(norm, "hamburguer"):
            if _has_word(norm, "frango"):
                return "golden char-grilled lean chicken burger patty"
            return "juicy char-grilled beef burger patty with grill marks"
        if _has_word(norm, "almondega"):
            return "browned roasted beef meatballs coated in rich red tomato sauce"
        if _has_word(norm, "parmegiana"):
            return "golden breaded cutlet topped with red tomato sauce and melted mozzarella cheese (a parmegiana)"
        if _has_word(norm, "milanesa"):
            return "crispy golden breaded fried beef cutlet (bife a milanesa)"
        if _has_word(norm, "carpaccio"):
            return "paper-thin ruby-red raw beef carpaccio slices arranged neatly"
        if _has_word(norm, "rosbife") or _has_word(norm, "bresaola"):
            return "thin tender slices of rosy-centered roasted lean beef"
        if _has_word(norm, "linguica") or _has_word(norm, "calabresa") or _has_word(norm, "toscana") or _has_word(norm, "paio"):
            return "golden grilled sliced Brazilian pork sausage links"
        if _has_word(norm, "salsicha"):
            return "smooth cooked reddish-tan frankfurter hot dog sausages"
        if _has_word(norm, "nuggets"):
            return "golden crispy baked breaded chicken nuggets"
        if _has_word(norm, "cordeiro") or _has_word(norm, "cabrito"):
            if _has_word(norm, "carre") or _has_word(norm, "costeleta"):
                return "char-grilled lamb rib chops with golden brown crust"
            return "tender herb-roasted lamb meat slices"
        if _has_word(norm, "coelho"):
            return "golden herb-roasted lean rabbit meat pieces"
        if _has_word(norm, "pato"):
            return "sliced golden-roasted duck breast meat"
        if _has_word(norm, "codorna"):
            return "small golden-brown oven-roasted whole quail"
        if _has_word(norm, "suina") or _has_word(norm, "porco") or _has_word(norm, "copa lombo"):
            if _has_word(norm, "defumada"):
                return "thin round slices of cured marbled smoked pork copa loin"
            if _has_word(norm, "barbecue"):
                return "glossy glazed roasted pork ribs coated in dark barbecue sauce"
            if _has_word(norm, "desfiado"):
                return "tender shredded slow-roasted pork meat mound"
            return "golden grilled juicy pork loin cut with seared crust"
        if _has_word(norm, "frango") or _has_word(norm, "chester") or _has_word(norm, "peru") or _has_word(norm, "galinha"):
            if _has_word(norm, "defumado"):
                return "neatly folded thin slices of smoked chicken breast"
            if _has_word(norm, "asa") or _has_word(norm, "drumete"):
                return "golden oven-roasted chicken wings and drumettes"
            if _has_word(norm, "moela"):
                return "braised savory brown chicken gizzards with herbs"
            if _has_word(norm, "figado"):
                return "pan-sauteed tender browned chicken livers"
            if _has_word(norm, "cubos"):
                return "golden pan-sauteed diced chicken breast cubes"
            if _has_word(norm, "assado") or _has_word(norm, "assada"):
                return "juicy golden oven-roasted poultry breast slices"
            return "tender cooked white chicken meat"
        if _has_word(norm, "carne"):
            if _has_word(norm, "moida") or _has_word(norm, "moido"):
                return "cooked browned seasoned ground beef crumbles"
            if _has_word(norm, "desfiada") or _has_word(norm, "carne seca") or _has_word(norm, "carne de sol"):
                return "tender browned shredded Brazilian cured beef with sauteed onion strips"
            if _has_word(norm, "panela") or _has_word(norm, "ossobuco") or _has_word(norm, "rabada") or _has_word(norm, "picadinho") or _has_word(norm, "cubos"):
                return "tender slow-braised brown beef stew cubes in rich savory gravy"
            if _has_word(norm, "role"):
                return "sliced braised rolled beef roulade stuffed with carrot strip"
            if _has_word(norm, "madeira"):
                return "seared filet mignon beef medallions glazed in glossy dark Madeira wine sauce"
            if _has_word(norm, "grelhado") or _has_word(norm, "grelhada") or _has_word(norm, "chorizo") or _has_word(norm, "ancho"):
                return "juicy char-grilled beef steak with crisp grill marks"
            return "tender oven-roasted sliced beef"

    # --- Ovos ---
    if is_egg:
        if _has_word(norm, "omelete"):
            if _has_word(norm, "legumes"):
                return "folded golden fluffy vegetable omelet studded with diced tomato and spinach"
            if _has_word(norm, "frango"):
                return "folded golden omelet stuffed with shredded chicken and melted cheese"
            return "folded golden fluffy egg omelet"
        if _has_word(norm, "clara") and _has_word(norm, "crua"):
            return "translucent raw egg white in a small clear glass bowl"
        if _has_word(norm, "gema") and _has_word(norm, "crua"):
            return "glossy bright-orange raw egg yolk in a small white porcelain dish"
        if _has_word(norm, "beneditinos"):
            return "poached egg perched on toasted English muffin with ham slice"
        if _has_word(norm, "mole") or _has_word(norm, "quente"):
            return "soft-boiled peeled egg halved showing glossy runny golden yolk"
        if _has_word(norm, "frito"):
            return "sunny-side-up fried egg cooked in olive oil with bright yellow yolk"

    # --- Produtos Açucarados & Sobremesas ---
    if is_sweet:
        if _has_word(norm, "chocolate"):
            if _has_word(norm, "branco"):
                return "creamy ivory white chocolate bar squares"
            return "rich dark chocolate bar squares"
        if _has_word(norm, "pudim"):
            return "glossy caramel-glazed Brazilian condensed milk flan pudding slice"
        if _has_word(norm, "brigadeiro"):
            return "three round glossy Brazilian chocolate fudge truffles coated in dark chocolate sprinkles"
        if _has_word(norm, "beijinho"):
            return "three round white Brazilian coconut fudge truffles coated in shredded coconut"
        if _has_word(norm, "mousse"):
            if _has_word(norm, "maracuja"):
                return "airy pale-yellow passionfruit mousse topped with passionfruit seeds in a small clear glass"
            return "rich airy dark chocolate mousse in a small white ramekin"
        if _has_word(norm, "manjar"):
            return "glossy white Brazilian coconut pudding slice topped with dark prune syrup"
        if _has_word(norm, "pave"):
            return "layered chocolate cream and biscuit dessert square (pave)"
        if _has_word(norm, "torta de limao"):
            return "Brazilian lime pie slice topped with lightly toasted white meringue peaks"
        if _has_word(norm, "cheesecake"):
            return "creamy white baked cheesecake slice topped with glossy ruby red berry sauce"
        if _has_word(norm, "sorvete"):
            if _has_word(norm, "chocolate"):
                return "smooth round scoop of rich dark chocolate ice cream"
            return "smooth round scoop of creamy vanilla ice cream"
        if _has_word(norm, "picole"):
            return "refreshing translucent fruit ice popsicle on a wooden stick"
        if _has_word(norm, "sorbet"):
            return "vibrant ruby-red berry fruit sorbet scoop"
        if _has_word(norm, "gelatina"):
            return "glossy translucent ruby-red gelatin jelly cubes"
        if _has_word(norm, "geleia"):
            if _has_word(norm, "pimenta"):
                return "glossy translucent ruby-red chili pepper jam in a small white ramekin"
            return "glossy ruby-red berry fruit jam spoonful in a small white ramekin"
        if _has_word(norm, "doce de leite"):
            return "smooth glossy caramel dulce de leche in a small white ramekin"
        if _has_word(norm, "pacoca"):
            return "cylindrical crumbly Brazilian peanut candy (pacoca)"
        if _has_word(norm, "pe-de-moca"):
            return "soft chewy caramel fudge square studded with roasted peanuts"
        if _has_word(norm, "goiabada"):
            return "firm ruby-red slice of Brazilian guava paste (goiabada)"
        if _has_word(norm, "bananada"):
            return "firm dark reddish-brown Brazilian banana fudge bar"
        if _has_word(norm, "acucar"):
            if _has_word(norm, "demerara"):
                return "sparkling coarse golden-amber demerara sugar crystals pile"
            if _has_word(norm, "coco"):
                return "warm caramel-brown granulated coconut sugar pile"
        if _has_word(norm, "agave") or _has_word(norm, "maple") or _has_word(norm, "bordo"):
            return "clear golden-amber natural syrup in a small glass bowl"
        if _has_word(norm, "coco") and _has_word(norm, "ralado"):
            return "fluffy snow-white shredded coconut flakes mound"

    # --- Nozes & Sementes ---
    if is_nut:
        if _has_word(norm, "pistache"):
            return "shelled vibrant green-purple roasted pistachio kernels pile"
        if _has_word(norm, "macadamia"):
            return "round creamy pale-ivory roasted macadamia nuts pile"
        if _has_word(norm, "avela"):
            return "round brown raw shelled hazelnuts pile"
        if _has_word(norm, "peca"):
            return "rich brown grooved pecan nut halves pile"
        if _has_word(norm, "amendoa"):
            return "whole natural brown raw almonds pile"
        if _has_word(norm, "castanha-de-caju"):
            return "golden curved roasted cashew nuts pile"
        if _has_word(norm, "castanha-do-brasil") or _has_word(norm, "castanha-do-para"):
            return "large shelled toasted Brazil nuts pile"
        if _has_word(norm, "castanha portuguesa"):
            return "roasted glossy brown scored chestnuts, one peeled showing golden kernel"
        if _has_word(norm, "mix de castanhas"):
            return "assorted natural mixed nuts pile with almonds, walnuts, cashews, and Brazil nuts"
        if _has_word(norm, "canhamo") or _has_word(norm, "hemp"):
            return "tiny pale cream-and-green hulled hemp hearts seeds pile"
        if _has_word(norm, "chips de coco"):
            return "crispy toasted white-and-golden dried coconut chips pile"
        if _has_word(norm, "coco ralado"):
            return "fine dry snow-white unsweetened shredded coconut pile"

    # --- Gorduras & Óleos ---
    if is_oil:
        if _has_word(norm, "banha"):
            return "smooth pure white solid pork lard scoop in a small white ramekin"
        if _has_word(norm, "manteiga"):
            return "smooth pale-yellow butter pat on clean surface"
        if _has_word(norm, "margarina"):
            return "smooth creamy light yellow spreadable margarine in a small white ramekin"
        if _has_word(norm, "oleo"):
            if _has_word(norm, "gergelim"):
                return "rich toasted amber sesame oil in a small clear glass bowl"
            if _has_word(norm, "linhaca"):
                return "bright golden cold-pressed flaxseed oil in a small clear glass bowl"
            return "clear golden vegetable cooking oil in a small clear glass bowl"

    # --- Cereais, Pães, Massas, Bolos & Biscoitos ---
    if is_cereal:
        if _has_word(norm, "pao"):
            if _has_word(norm, "croissant"):
                return "flaky golden-brown baked French butter croissant"
            if _has_word(norm, "brioche"):
                return "soft golden rich sliced brioche bread"
            if _has_word(norm, "baguete") or _has_word(norm, "italiano") or _has_word(norm, "ciabatta"):
                return "crusty artisan white bread slices with airy interior"
            if _has_word(norm, "frances"):
                return "crusty golden Brazilian French bread roll (pao frances)"
            if _has_word(norm, "hamburguer"):
                return "soft golden round sesame burger bun"
            if _has_word(norm, "bisnaguinha") or _has_word(norm, "cachorro"):
                return "soft pale golden mini milk bread rolls"
            if _has_word(norm, "batata"):
                return "soft round golden Brazilian potato bread roll"
            if _has_word(norm, "integral") or _has_word(norm, "light"):
                return "sliced soft brown whole-wheat sandwich bread"
            return "soft sliced white sandwich bread"
        if _has_word(norm, "torrada"):
            return "two crispy golden-brown toasted whole-grain bread slices"
        if _has_word(norm, "broa"):
            return "rustic golden-yellow baked Brazilian cornmeal broa bread"
        if _has_word(norm, "biscoito") or _has_word(norm, "cookie"):
            if _has_word(norm, "cookie"):
                return "golden baked whole-grain oat cookie studded with dark chocolate chips"
            if _has_word(norm, "polvilho") or _has_word(norm, "peta"):
                return "airy crisp golden-white Brazilian cassava starch stick biscuits"
            if _has_word(norm, "sequilho"):
                return "small pale crumbly melt-in-mouth cornstarch cookies"
            if _has_word(norm, "rosquinha"):
                return "golden ring-shaped coconut cookies"
            if _has_word(norm, "maria"):
                return "round pale golden crisp Marie tea biscuits"
            if _has_word(norm, "integral") or _has_word(norm, "aveia") or _has_word(norm, "gergelim"):
                return "crisp golden-brown whole-grain seeded crackers"
            return "square crispy golden salted water-and-salt crackers"
        if _has_word(norm, "barra de cereais"):
            return "chewy golden oat and crispy rice cereal bar"
        if _has_word(norm, "macarrao"):
            if _has_word(norm, "penne"):
                return "cooked al dente tubular penne pasta pile"
            if _has_word(norm, "parafuso") or _has_word(norm, "fusilli"):
                return "cooked al dente spiral fusilli pasta pile"
            if _has_word(norm, "talharim") or _has_word(norm, "fettuccine"):
                return "cooked ribbon fettuccine egg pasta nest"
            return "cooked al dente golden spaghetti pasta nest"
        if _has_word(norm, "arroz"):
            if _has_word(norm, "cru"):
                return "dry raw pale-golden parboiled rice grains pile"
            return "fluffy cooked white rice grains mound"
        if _has_word(norm, "polenta"):
            if _has_word(norm, "grelhada") or _has_word(norm, "assada"):
                return "golden grilled yellow cornmeal polenta rectangles with grill marks"
            return "smooth creamy golden yellow cooked cornmeal polenta"
        if _has_word(norm, "pipoca"):
            return "fluffy popped white popcorn pile"
        if _has_word(norm, "milho") and _has_word(norm, "espiga"):
            return "boiled bright yellow sweet corn on the cob"
        if _has_word(norm, "milho") and _has_word(norm, "torrado"):
            return "crunchy golden roasted salted corn kernels snack pile"
        if _has_word(norm, "nachos") or _has_word(norm, "tortilha"):
            return "crispy triangular golden corn tortilla chips pile"
        if _has_word(norm, "farinha"):
            if _has_word(norm, "flocada") or _has_word(norm, "flocao"):
                return "coarse bright-yellow Brazilian flaked cornmeal (flocao) pile"
            if _has_word(norm, "panko"):
                return "airy coarse pale crispy Japanese panko breadcrumbs mound"
            if _has_word(norm, "integral"):
                return "speckled tan whole-wheat flour mound"
        if _has_word(norm, "cereal matinal") or _has_word(norm, "all-bran"):
            return "brown crunchy high-fiber wheat bran cereal sticks pile"
        if _has_any_word(norm, ("cevadinha", "painco", "sarraceno")):
            return "fluffy cooked whole-grain ancient grain mound"

    # --- Leguminosas ---
    if is_legume:
        if _has_word(norm, "tofu"):
            if _has_word(norm, "defumado"):
                return "golden-brown smoked firm tofu slices"
            return "golden pan-grilled firm white tofu slabs with sear marks"
        if _has_word(norm, "tempeh"):
            return "sliced golden pan-seared fermented soybean tempeh cake"
        if _has_word(norm, "texturizada") or _has_word(norm, "pts"):
            if _has_word(norm, "seca"):
                return "dry light-tan textured soy protein granules pile"
            return "cooked hydrated browned textured soy protein crumbles"
        if _has_word(norm, "feijao"):
            if _has_word(norm, "azuki"):
                return "cooked small glossy dark-red adzuki beans mound"
            if _has_word(norm, "branco"):
                return "cooked plump creamy white cannellini beans mound"
            if _has_word(norm, "verde") or _has_word(norm, "manteiguinha"):
                return "cooked pale yellow-green Brazilian cowpea beans mound"
            return "cooked tender brown Brazilian beans in light broth"
        if _has_word(norm, "ervilha"):
            return "bright vibrant green cooked tender green peas mound"
        if _has_word(norm, "soja"):
            if _has_word(norm, "torrada"):
                return "crunchy golden roasted salted soybeans snack pile"
            return "cooked plump pale yellow soybeans mound"
        if _has_word(norm, "lentilha"):
            return "cooked soft orange-red split red lentils mound"
        if _has_word(norm, "fava"):
            return "cooked large creamy broad fava beans mound"
        if _has_word(norm, "farinha de grao-de-bico"):
            return "fine pale golden-yellow chickpea flour mound"
        if _has_word(norm, "amendoim"):
            if _has_word(norm, "cozido"):
                return "boiled soft beige peanuts in shells and shelled"
            return "clean golden-tan roasted skinless unsalted peanuts pile"

    # --- Frutas ---
    if is_fruit:
        if _has_word(norm, "farinha de banana"):
            return "fine pale cream-tan green banana flour mound"
        if _has_word(norm, "chips de banana"):
            return "crispy thin round golden green-banana chips pile"
        if _has_word(norm, "biomassa"):
            return "smooth pale beige cooked green banana biomass puree in a small white bowl"
        if _has_word(norm, "banana") and _has_word(norm, "assada"):
            return "caramelized golden baked ripe banana halved and dusted with cinnamon"
        if _has_word(norm, "banana"):
            return "fresh ripe yellow sweet bananas"
        if _has_word(norm, "abacaxi") and (_has_word(norm, "assado") or _has_word(norm, "grelhado")):
            return "golden char-grilled caramelized pineapple ring dusted with cinnamon"
        if _has_word(norm, "maca"):
            if _has_word(norm, "verde"):
                return "crisp glossy bright-green Granny Smith apple, one whole and one sliced"
            if _has_word(norm, "assada"):
                return "tender baked golden apple halves dusted with cinnamon"
            if _has_word(norm, "chips") or _has_word(norm, "desidratada"):
                return "crispy thin dried apple ring chips"
            return "crisp glossy red Gala apple, one whole and one sliced"
        if _has_word(norm, "uva"):
            if _has_word(norm, "passa"):
                return "golden amber dried seedless raisins pile"
            if _has_word(norm, "verde") or _has_word(norm, "thompson"):
                return "crisp translucent green seedless grapes cluster"
            if _has_word(norm, "roxa") or _has_word(norm, "vitoria") or _has_word(norm, "niagara"):
                return "plump deep purple-red fresh grapes cluster"
        if _has_word(norm, "kiwi"):
            return "golden-fleshed sun-gold kiwi halved showing bright yellow sweet flesh"
        if _has_word(norm, "acai"):
            return "thick glossy deep purple unsweetened acai berry sorbet scoop in a small white bowl"
        if _has_word(norm, "grapefruit") or _has_word(norm, "toranja"):
            return "fresh halved pink grapefruit showing ruby-pink juicy segments"
        if _has_word(norm, "limao") and _has_word(norm, "siciliano"):
            return "bright sunny yellow Sicilian lemon, one whole and one halved"
        if _has_word(norm, "nectarina") or _has_word(norm, "pessego"):
            return "fresh ripe golden-blush stone fruit halved showing juicy yellow flesh"
        if _has_word(norm, "damasco"):
            return "fresh velvety golden-orange whole apricots, one halved"
        if _has_word(norm, "physalis"):
            return "glossy bright orange round physalis berry nestled in open papery husk"
        if _has_word(norm, "sapoti"):
            return "brown oval tropical sapodilla fruit halved showing caramel-brown sweet flesh"
        if _has_word(norm, "framboesa"):
            return "frosted ruby-red frozen raspberries pile"
        if _has_word(norm, "morango"):
            return "frosted bright-red frozen strawberries pile"
        if _has_word(norm, "caqui"):
            return "glossy deep orange-red soft ripe persimmon fruit"
        if _has_word(norm, "melao"):
            return "juicy pale-green honeydew melon wedges"
        if _has_word(norm, "pera"):
            return "ripe green-gold juicy pear, one whole and one sliced"
        if _has_word(norm, "ameixa"):
            return "glossy deep red ripe fresh plums, one halved"
        if _has_word(norm, "laranja"):
            return "fresh ripe bright-orange navel orange, one halved"
        if _has_word(norm, "tangerina") or _has_word(norm, "mexerica"):
            return "fresh ripe bright-orange tangerine with peeled segments"
        if _has_word(norm, "manga"):
            return "ripe sweet colorful mango, one halved showing bright yellow flesh"

    # --- Verduras, Hortaliças & Tubérculos ---
    if is_veg:
        if _has_word(norm, "chips"):
            if _has_word(norm, "doce"):
                return "crispy thin orange baked sweet potato chips pile"
            return "crispy thin golden baked cassava chips pile"
        if _has_word(norm, "polvilho") and _has_word(norm, "azedo"):
            return "fine pure snow-white sour cassava starch powder mound"
        if _has_word(norm, "alga") or _has_word(norm, "nori"):
            return "crisp dark emerald-black roasted Japanese nori seaweed sheet"
        if _has_word(norm, "picles"):
            return "crisp green pickled cucumber gherkins sliced"
        if _has_word(norm, "tomate seco"):
            return "glossy deep-red sun-dried tomatoes marinated in olive oil"
        if _has_word(norm, "arroz de couve-flor"):
            return "fluffy white finely riced cooked cauliflower mound"
        if _has_word(norm, "alcachofra"):
            return "tender pale-green cooked artichoke hearts halved"
        if _has_word(norm, "broto de alfafa"):
            return "delicate tangled fresh green-tipped alfalfa sprouts mound"
        if _has_word(norm, "broto de bambu"):
            return "pale cream crisp sliced bamboo shoots"
        if _has_word(norm, "kale"):
            return "fresh curly dark-green Tuscan kale leaves"
        if _has_word(norm, "endivia"):
            return "crisp pale yellow-white Belgian endive spears"
        if _has_word(norm, "funcho") or _has_word(norm, "erva-doce"):
            return "fresh crisp white fennel bulb with feathery green fronds"
        if _has_word(norm, "radicchio"):
            return "crisp deep burgundy-red radicchio chicory leaves with white veins"
        if _has_word(norm, "escarola"):
            return "fresh curly bright-green escarole endive leaves"
        if _has_word(norm, "hortela"):
            return "fresh vibrant green aromatic mint leaves sprig"
        if _has_word(norm, "coentro"):
            return "fresh bright green cilantro coriander leaves bunch"
        if _has_word(norm, "ora-pro-nobis"):
            return "fresh glossy fleshy dark-green ora-pro-nobis leaves"
        if _has_word(norm, "pimenta biquinho"):
            return "glossy bright red teardrop-shaped Brazilian biquinho sweet peppers"
        if _has_word(norm, "dedo-de-moca"):
            return "glossy bright red elongated fresh Brazilian chili peppers"
        if _has_word(norm, "cebola") and _has_word(norm, "roxa"):
            return "crisp vibrant purple-red onion sliced cleanly"
        if _has_word(norm, "cebola") and _has_word(norm, "caramelizada"):
            return "glossy deep golden-brown slow-caramelized onion strips"
        if _has_word(norm, "pepino"):
            return "crisp slender dark-green Japanese cucumber sliced cleanly"
        if _has_word(norm, "mix de folhas"):
            return "fresh colorful mixed baby salad greens, arugula, and purple lettuce leaves"
        if _has_word(norm, "batata") and _has_word(norm, "yacon"):
            return "sliced fresh translucent pale-yellow yacon root tuber"
        if _has_word(norm, "batata") and _has_word(norm, "roxa"):
            return "cooked vivid deep-purple sweet potato halved showing bright violet flesh"
        if _has_word(norm, "batata frita"):
            return "golden crispy air-fried potato french fries"
        if _has_word(norm, "batata") and _has_word(norm, "baroa"):
            return "golden oven-roasted bright yellow arracacha root pieces"
        if _has_word(norm, "batata") and _has_word(norm, "inglesa"):
            return "golden baked skin-on white potato halved showing fluffy interior"
        if _has_word(norm, "brocolis"):
            return "vibrant bright-green steamed broccoli florets"
        if _has_word(norm, "couve-flor"):
            return "lightly roasted ivory cauliflower florets with golden edges"
        if _has_word(norm, "abobrinha"):
            return "char-grilled green zucchini rounds with neat sear marks"
        if _has_word(norm, "berinjela"):
            return "golden roasted eggplant slices with tender caramelized flesh"
        if _has_word(norm, "cenoura"):
            return "vibrant bright-orange tender baby carrots or glazed carrot rounds"
        if _has_word(norm, "beterraba"):
            return "roasted deep ruby-red beetroot wedges"
        if _has_word(norm, "vagem"):
            return "crisp bright-green cooked French green beans"
        if _has_word(norm, "quiabo"):
            return "tender cooked sliced vibrant green okra pods"
        if _has_word(norm, "tomate") and (_has_word(norm, "pelado") or _has_word(norm, "passata")):
            return "rich vibrant red peeled Italian plum tomatoes in smooth red puree"

    # --- Miscelâneas / Temperos / Molhos / Industrializados ---
    if is_misc or is_supp:
        if _has_word(norm, "vinagre"):
            if _has_word(norm, "balsamico"):
                return "glossy dark syrupy balsamic vinegar in a small white dipping bowl"
            return "clear golden amber apple cider vinegar in a small clear glass bowl"
        if _has_word(norm, "mostarda"):
            if _has_word(norm, "dijon"):
                return "smooth pale beige-yellow French Dijon mustard in a small white ramekin"
            return "smooth bright-yellow classic mustard in a small white ramekin"
        if _has_word(norm, "alcaparra"):
            return "small olive-green pickled caper buds pile"
        if _has_word(norm, "azeitona"):
            return "glossy plump dark purple-black Chilean Azapa olives"
        if _has_word(norm, "barbecue"):
            return "glossy dark smoky brown barbecue sauce in a small white ramekin"
        if _has_word(norm, "ketchup"):
            return "glossy bright red tomato ketchup in a small white ramekin"
        if _has_word(norm, "maionese"):
            return "smooth light pale-cream mayonnaise in a small white ramekin"
        if _has_word(norm, "sriracha"):
            return "vibrant spicy red sriracha chili sauce in a small white ramekin"
        if _has_word(norm, "teriyaki") or _has_word(norm, "ingles"):
            return "glossy dark brown savory Asian sauce in a small white dipping dish"
        if _has_word(norm, "leite") and _has_word(norm, "coco"):
            return "smooth creamy white light coconut milk in a small white bowl"
        if _has_word(norm, "caesar") or _has_word(norm, "tartaro"):
            return "creamy pale herb dressing sauce in a small white ramekin"
        if _has_word(norm, "alecrim"):
            return "fresh aromatic green rosemary herb sprigs"
        if _has_word(norm, "oregano"):
            return "dried fragrant green crushed oregano herb leaves pile"
        if _has_word(norm, "paprica") or _has_word(norm, "colorau"):
            return "vibrant deep-red fine paprika spice powder mound"
        if _has_word(norm, "pimenta-do-reino"):
            return "coarse freshly cracked black pepper spice mound"
        if _has_word(norm, "cominho") or _has_word(norm, "noz-moscada"):
            return "warm earthy brown ground spice powder mound"
        if _has_word(norm, "curry"):
            return "vibrant golden-ochre aromatic curry spice powder mound"
        if _has_word(norm, "sal rosa"):
            return "coarse sparkling pastel-pink Himalayan salt crystals pile"
        if _has_word(norm, "sal marinho"):
            return "clean fine sparkling white sea salt crystals pile"

    # --- Alimentos Preparados (Pratos brasileiros, sopas, saladas, sanduíches, sushi, pizzas, bolos) ---
    if is_prep:
        if _has_word(norm, "sushi") or _has_word(norm, "uramaki") or _has_word(norm, "hossomaki") or _has_word(norm, "nigiri") or _has_word(norm, "hot roll"):
            if _has_word(norm, "hot roll"):
                return "crispy golden deep-fried salmon sushi hot rolls sliced neatly"
            if _has_word(norm, "nigiri"):
                return "two neat Japanese salmon nigiri sushi pieces with fresh orange salmon over white rice"
            if _has_word(norm, "kappamaki") or _has_word(norm, "pepino"):
                return "neat Japanese cucumber nori sushi rolls (kappamaki) sliced cleanly"
            return "fresh Japanese salmon cream cheese sushi rolls (uramaki) topped with sesame seeds"
        if _has_word(norm, "temaki"):
            return "crisp dark green nori seaweed cone hand roll stuffed with rice and diced fresh orange salmon (temaki)"
        if _has_word(norm, "guioza"):
            return "delicate pleated steamed Japanese gyoza dumplings"
        if _has_word(norm, "harumaki") or _has_word(norm, "primavera"):
            return "golden crispy fried cylindrical spring rolls halved diagonally showing vegetables"
        if _has_word(norm, "shimeji"):
            return "glossy butter-sauteed brown shimeji mushroom clusters with scallions"
        if _has_word(norm, "pizza"):
            if _has_word(norm, "margherita"):
                return "single artisanal Margherita pizza slice with melted mozzarella, red tomato sauce, and fresh green basil leaves"
            if _has_word(norm, "calabresa"):
                return "single pizza slice topped with sliced smoked calabresa sausage and red onion rings"
            if _has_word(norm, "frango"):
                return "single Brazilian pizza slice topped with shredded chicken and creamy white catupiry cheese"
            if _has_word(norm, "portuguesa"):
                return "single Brazilian Portuguesa pizza slice with ham, boiled egg, olives, peas, and melted mozzarella"
            if _has_word(norm, "atum"):
                return "single pizza slice topped with flaked tuna, melted cheese, and onion rings"
            return "single classic golden baked mozzarella cheese pizza slice"
        if _has_word(norm, "esfiha"):
            if _has_word(norm, "fechada"):
                return "triangular golden baked Middle Eastern stuffed pastry (esfiha fechada)"
            if _has_word(norm, "queijo"):
                return "round open-faced baked Arabic flatbread topped with melted white cheese (esfiha aberta)"
            return "round open-faced baked Arabic flatbread topped with seasoned ground beef (esfiha aberta)"
        if _has_word(norm, "escondidinho"):
            return "golden gratinated Brazilian shepherd pie (escondidinho) with creamy mashed topping and savory shredded meat layer"
        if _has_word(norm, "moqueca") or _has_word(norm, "bobo"):
            return "rich vibrant golden-orange Brazilian coastal seafood stew with peppers and fresh cilantro in a small white bowl"
        if _has_word(norm, "risoto"):
            return "creamy glossy Italian risotto mound garnished lightly with herbs and parmesan"
        if _has_word(norm, "paella"):
            return "vibrant saffron-yellow Spanish seafood paella rice studded with shrimp, mussels, and peas"
        if _has_word(norm, "strogonoff"):
            return "creamy light-brown Brazilian stroganoff stew with tender slices and mushrooms"
        if _has_word(norm, "sopa") or _has_word(norm, "caldo") or _has_word(norm, "creme") or _has_word(norm, "canja"):
            if _has_word(norm, "caldo verde"):
                return "creamy pale potato soup studded with thin green collard greens strips and sausage in a small white bowl"
            if _has_word(norm, "abobora"):
                return "velvety bright-orange roasted pumpkin cream soup in a small white porcelain bowl"
            if _has_word(norm, "ervilha"):
                return "thick vibrant green split pea soup in a small white porcelain bowl"
            if _has_word(norm, "feijao"):
                return "rich dark-brown Brazilian bean soup in a small white porcelain bowl"
            if _has_word(norm, "canja"):
                return "warm clear Brazilian chicken and rice soup with diced carrots in a small white porcelain bowl"
            if _has_word(norm, "mandioquinha") or _has_word(norm, "mandioca"):
                return "velvety pale golden root vegetable cream soup garnished with parsley in a small white bowl"
            return "warm comforting homemade vegetable soup in a small white porcelain bowl"
        if _has_word(norm, "salada") or _has_word(norm, "vinagrete"):
            if _has_word(norm, "frutas"):
                return "colorful fresh diced tropical fruit salad medley with strawberry, kiwi, mango, and papaya in a small white bowl"
            if _has_word(norm, "caprese"):
                return "fresh Italian Caprese salad with red tomato slices, white buffalo mozzarella, and green basil leaves"
            if _has_word(norm, "caesar"):
                return "crisp romaine Caesar salad with grilled chicken strips, shaved parmesan, and golden croutons"
            if _has_word(norm, "grega"):
                return "fresh Mediterranean Greek salad with diced tomato, cucumber, black olives, red onion, and white feta cubes"
            if _has_word(norm, "vinagrete"):
                return "fresh Brazilian finely diced tomato, onion, and bell pepper vinaigrette salsa in a small white bowl"
            return "fresh colorful mixed healthy salad bowl with protein and vegetables"
        if _has_word(norm, "pure"):
            if _has_word(norm, "abobora"):
                return "smooth velvety bright-orange mashed pumpkin puree mound"
            if _has_word(norm, "batata-doce") or _has_word(norm, "doce"):
                return "smooth pale-golden mashed sweet potato puree mound"
            if _has_word(norm, "baroa") or _has_word(norm, "mandioquinha"):
                return "smooth sunny-yellow mashed arracacha puree mound"
            return "smooth creamy fluffy white mashed potato puree mound"
        if _has_word(norm, "misto quente") or _has_word(norm, "queijo quente") or _has_word(norm, "bauru") or _has_word(norm, "sanduiche") or _has_word(norm, "beirute"):
            return "neatly halved fresh toasted sandwich showing colorful layers of cheese, lean protein, and crisp greens"
        if _has_word(norm, "wrap"):
            return "neatly halved whole-wheat wrap roll stuffed with grilled chicken strips and fresh green salad"
        if _has_word(norm, "cheeseburger") or _has_word(norm, "x-salada"):
            return "classic gourmet cheeseburger with seared beef patty, melted cheese, crisp lettuce, and tomato on a toasted bun"
        if _has_word(norm, "cachorro-quente"):
            return "classic Brazilian hot dog in soft bun topped with light tomato sauce"
        if _has_word(norm, "tapioca"):
            return "folded white Brazilian tapioca crepe stuffed with savory filling peeking from the edge"
        if _has_word(norm, "lasanha"):
            return "baked layered lasagna square topped with rich red tomato sauce and golden melted cheese"
        if _has_word(norm, "macarrao") or _has_word(norm, "nhoque") or _has_word(norm, "ravioli") or _has_word(norm, "cappelletti"):
            if _has_word(norm, "pesto"):
                return "cooked pasta coated in vibrant green basil pesto sauce"
            if _has_word(norm, "branco") or _has_word(norm, "carbonara"):
                return "cooked pasta coated in glossy creamy white parmesan sauce"
            if _has_word(norm, "alho e oleo"):
                return "cooked golden spaghetti tossed with toasted garlic flakes and chopped parsley"
            return "cooked pasta topped with rich red tomato sauce and fresh basil"
        if _has_word(norm, "panqueca"):
            return "rolled golden savory Brazilian crepe pancake topped with red tomato sauce"
        if _has_word(norm, "bolo") or _has_word(norm, "muffin") or _has_word(norm, "brownie"):
            if _has_word(norm, "brownie"):
                return "rich fudgy dark chocolate brownie square"
            if _has_word(norm, "cenoura") and _has_word(norm, "chocolate"):
                return "fluffy orange Brazilian carrot cake slice topped with glossy dark chocolate ganache"
            if _has_word(norm, "cenoura"):
                return "moist golden-orange homemade carrot cake slice"
            if _has_word(norm, "banana"):
                return "moist golden-brown whole-grain banana bread cake slice"
            if _has_word(norm, "fuba"):
                return "fluffy sunny-yellow homemade Brazilian cornmeal cake slice"
            return "fluffy homemade golden sponge cake slice"
        if _has_word(norm, "torta") or _has_word(norm, "quiche") or _has_word(norm, "empadao"):
            return "golden baked savory pie slice showing tender creamy filling and flaky crust"
        if _has_word(norm, "farofa"):
            return "golden toasted seasoned Brazilian farofa crumbs mound"
        if _has_word(norm, "bolinho") or _has_word(norm, "bolinha") or _has_word(norm, "rissole") or _has_word(norm, "coxinha") or _has_word(norm, "falafel") or _has_word(norm, "pastel") or _has_word(norm, "enroladinho") or _has_word(norm, "joelho") or _has_word(norm, "pao de batata") or _has_word(norm, "pao de alho") or _has_word(norm, "pao na chapa") or _has_word(norm, "pao de queijo") or _has_word(norm, "waffle"):
            if _has_word(norm, "falafel"):
                return "three crispy golden-brown Middle Eastern chickpea falafel balls, one halved showing herb-green interior"
            if _has_word(norm, "waffle"):
                return "crispy golden grid-patterned Belgian waffle square"
            if _has_word(norm, "pao na chapa"):
                return "golden butter-griddled sliced Brazilian French bread halves"
            if _has_word(norm, "pao de alho"):
                return "golden toasted baguette stuffed with herb garlic cream"
            return "crispy golden baked savory Brazilian snack pastry"
        if _has_word(norm, "molho"):
            if _has_word(norm, "tomate") or _has_word(norm, "bolonhesa"):
                return "rich thick red homemade tomato sauce in a small white porcelain ramekin"
            if _has_word(norm, "chimichurri"):
                return "vibrant green herb and olive oil chimichurri sauce in a small white ramekin"
            if _has_word(norm, "mostarda"):
                return "glossy golden honey mustard dressing in a small white ramekin"
            return "smooth creamy white herb sauce in a small white porcelain ramekin"
        if _has_word(norm, "pate"):
            return "creamy smooth savory spreadable pate in a small white porcelain ramekin"
        if _has_word(norm, "acai"):
            return "deep purple Brazilian acai bowl topped with banana slices and crunchy granola"
        if _has_word(norm, "taco") or _has_word(norm, "burrito"):
            return "colorful Mexican wrap filled with seasoned meat, fresh diced tomatoes, and crisp lettuce"
        if _has_word(norm, "arroz"):
            if _has_word(norm, "sirio") or _has_word(norm, "mjadra"):
                return "fluffy Middle Eastern rice cooked with brown lentils and crispy caramelized onions"
            if _has_word(norm, "brocolis"):
                return "fluffy white rice tossed with bright green chopped broccoli florets"
            return "colorful seasoned Brazilian rice dish garnished with diced vegetables and herbs"
        if _has_word(norm, "frango") or _has_word(norm, "galinhada") or _has_word(norm, "fricasse"):
            return "savory golden cooked Brazilian chicken dish with tender pieces and rich sauce"
        if _has_word(norm, "tutu"):
            return "creamy smooth thick Brazilian refried bean puree (tutu de feijao) topped with parsley"
        if _has_word(norm, "chilli") or _has_word(norm, "ragu") or _has_word(norm, "carne louca") or _has_word(norm, "cozido"):
            return "rich savory slow-simmered braised beef stew with herbs"
        if _has_word(norm, "caponata") or _has_word(norm, "ratatouille") or _has_word(norm, "legumes"):
            return "colorful roasted Mediterranean vegetables medley with zucchini, eggplant, tomatoes, and herbs"
        if _has_word(norm, "charuto"):
            return "neatly rolled stuffed grape leaves dolmas"
        if _has_word(norm, "cuscuz"):
            return "bright yellow steamed Brazilian cornmeal couscous wedge"
        if _has_word(norm, "mousse proteico"):
            return "rich velvety dark chocolate high-protein mousse in a small white bowl"
        if _has_word(norm, "coalhada"):
            return "creamy white yogurt bowl topped with golden honey drizzle and granola"

    return None


# =============================================================================
# 3. BASE PRINCIPAL TACO (1º segmento antes da vírgula)
# =============================================================================
BASE_PT_EN: dict[str, str] = {
    "abacate": "avocado, one whole and one halved showing pit and green flesh",
    "abacaxi": "ripe yellow pineapple, whole and sliced",
    "abadejo": "white pollock fish",
    "abiu": "golden yellow round tropical abiu fruit cut open showing translucent white pulp",
    "abobora": "pumpkin squash",
    "abobrinha": "zucchini squash",
    "acai": "deep purple acai berry puree",
    "acelga": "fresh crisp Swiss chard leaves with white stems",
    "acerola": "glossy bright red acerola cherries",
    "achocolatado": "rich brown chocolate drink powder mound",
    "acucar": "sugar crystals pile",
    "agriao": "fresh green watercress leaves bunch",
    "aipo": "fresh crisp green celery stalks",
    "alface": "fresh crisp lettuce head",
    "alfavaca": "fresh fragrant green sweet basil leaves",
    "alho": "fresh white garlic bulbs and peeled cloves",
    "alho-poro": "fresh whole white-and-green leeks",
    "almeirao": "fresh elongated green dandelion chicory leaves",
    "ameixa": "ripe purple plums",
    "amendoa": "roasted salted whole almonds",
    "amendoim": "peanuts",
    "arroz": "white rice grains",
    "atemoia": "green scaly atemoya fruit cut in half showing creamy white pulp",
    "atum": "tuna fish",
    "aveia": "rolled oat flakes mound",
    "azeite": "golden cooking oil in a small clear glass bowl",
    "azeite de oliva extra virgem": "golden-green extra virgin olive oil in a small clear glass bowl",
    "azeitona": "olives",
    "bacalhau": "salted codfish fillet",
    "banana": "ripe yellow bananas",
    "batata": "potatoes",
    "bebida isotonica": "clear sports drink in a clean small glass",
    "bebida lactea": "creamy peach milk yogurt drink in a small clear glass",
    "berinjela": "glossy dark purple eggplant",
    "beterraba": "deep red beetroot, one whole and one sliced",
    "biscoito": "biscuits",
    "bolo": "sponge cake slice",
    "brocolis": "fresh green broccoli florets",
    "cacau": "raw cacao pod halved showing cocoa beans and white pulp",
    "cacao": "dogfish shark fish steak",
    "cafe": "roasted dark coffee",
    "caja": "golden-yellow hog plum fruit (caja)",
    "caja-manga": "golden-yellow ambarella hog plum fruit, one halved",
    "caju": "orange-red cashew apple fruit with curved cashew nut attached",
    "camarao": "pink-orange shrimp",
    "caqui": "ripe glossy orange persimmon fruit",
    "cara": "white starchy yam tuber, sliced",
    "carambola": "golden yellow starfruit, one whole and star-shaped slices",
    "caranguejo": "cooked bright orange-red crab",
    "carne": "beef",
    "caruru": "fresh green amaranth leafy greens",
    "castanha-de-caju": "roasted salted curved cashew nuts",
    "castanha-do-brasil": "shelled large Brazil nuts",
    "catalonha": "fresh green Italian chicory leaves",
    "cebola": "yellow onion bulb, one whole and one halved",
    "cebolinha": "fresh crisp green scallions chives",
    "cenoura": "bright orange carrots",
    "cereal matinal": "crispy golden toasted cornflakes breakfast cereal",
    "cereais": "corn cereal flakes",
    "cerveja": "golden pilsner beer with white foam in a small clean glass",
    "cha": "clear brewed amber tea in a small clear glass cup",
    "chantilly": "swirl peak of fluffy white whipped cream",
    "chicoria": "fresh green curly endive chicory leaves",
    "chocolate": "broken squares of chocolate bar",
    "chuchu": "pale green pear-shaped chayote squash, one halved",
    "ciriguela": "small glossy red-orange tropical jocote fruits (ciriguela)",
    "coco": "coconut",
    "coentro": "dried green coriander leaf flakes pile",
    "corimba": "fresh whole silver river fish",
    "corimbata": "river fish fillet",
    "corvina": "croaker fish",
    "couve": "fresh dark-green collard greens leaves",
    "couve-flor": "fresh white cauliflower florets",
    "creme de arroz": "fine white rice cream cereal powder mound",
    "creme de leite": "smooth thick white dairy heavy cream in a small white ramekin",
    "creme de milho": "fine pale-yellow corn cream powder mound",
    "cupuacu": "brown oblong tropical cupuacu pod opened showing creamy white pulp",
    "dourada": "fresh whole golden river dorado fish",
    "ervilha": "green peas",
    "espinafre": "fresh dark green spinach leaves",
    "farinha": "flour mound",
    "fecula": "fine snow-white cassava starch powder mound",
    "feijao": "beans",
    "figo": "fresh purple figs cut in half showing pink interior",
    "frango": "chicken",
    "fruta-pao": "round green textured breadfruit cut in half",
    "gelatina": "flavored fruit gelatin powder mound",
    "gergelim": "pale beige sesame seeds pile",
    "glicose de milho": "clear glossy golden corn syrup in a small glass bowl",
    "goiaba": "guava fruit cut in half",
    "grao-de-bico": "raw beige chickpeas pile",
    "graviola": "green spiky soursop fruit cut open showing creamy white pulp",
    "guandu": "dry speckled pigeon peas pile",
    "hamburguer": "beef burger patty",
    "inhame": "brown hairy taro root tuber, one sliced white",
    "iogurte": "smooth creamy yogurt in a small white bowl",
    "jabuticaba": "glossy dark purple round jabuticaba berries",
    "jaca": "ripe yellow fleshy jackfruit pods",
    "jambo": "glossy pink-red bell-shaped wax apple (jambo) fruit",
    "jamelao": "dark purple oblong jambolan berries",
    "jilo": "small glossy bright green scarlet eggplant fruits (jilo)",
    "jurubeba": "small round green jurubeba fruits",
    "kiwi": "fuzzy brown kiwi fruit cut in half showing emerald green flesh",
    "lambari": "small whole silver freshwater fish",
    "laranja": "ripe orange fruit",
    "lasanha": "fresh rectangular sheets of lasagna pasta",
    "leite": "milk",
    "lentilha": "lentils",
    "limao": "fresh green limes",
    "linhaca": "glossy brown flaxseeds pile",
    "linguica": "pork or chicken sausages",
    "macarrao": "pasta noodles",
    "macauba": "round brown macauba palm fruits",
    "maionese": "smooth creamy pale yellow mayonnaise in a small white ramekin",
    "mamao": "ripe papaya",
    "mandioca": "cassava yuca root",
    "manga": "ripe colorful mango",
    "manjericao": "fresh green sweet basil leaves",
    "manjuba": "small crispy whole whitebait fish",
    "manteiga": "smooth pale-yellow dairy butter block",
    "maracuja": "passion fruit halved showing yellow seeded pulp",
    "margarina": "smooth yellow spreadable margarine in a small white ramekin",
    "marmelada": "firm translucent ruby-amber quince paste slice",
    "maxixe": "small round spiky green gherkin squash (maxixe)",
    "maca": "crisp red apple, one whole and one sliced",
    "mel": "clear golden honey in a small clear glass bowl",
    "melado": "rich dark amber sugarcane molasses in a small glass bowl",
    "melancia": "ripe red watermelon wedges",
    "melao": "sweet yellow melon wedges",
    "merluza": "white hake fish fillet",
    "mexerica": "ripe bright-orange mandarin tangerine",
    "milho": "corn",
    "mingau": "pale cream infant cereal porridge powder mound",
    "morango": "ripe bright red strawberries with green caps",
    "mortadela": "thinly sliced pink mortadella sausage",
    "mostarda": "fresh green ruffled mustard greens leaves",
    "nabo": "white-and-purple turnip root, one halved",
    "nespera": "golden-orange loquat fruits",
    "noz": "shelled walnut halves",
    "oleo": "clear pale-golden vegetable oil in a small clear glass bowl",
    "peito de frango grelhado": "char-grilled seasoned chicken breast fillet",
    "pepino": "fresh green cucumber, whole and sliced",
    "pequi": "bright yellow pequi fruit halved showing spiny pit",
    "peru": "turkey roast meat",
    "pescada": "white whiting fish",
    "pescadinha": "small whole silver whiting fish",
    "pimentao": "fresh glossy bell pepper",
    "pinha": "green segmented sugar-apple fruit cut open showing white flesh",
    "pintado": "spotted freshwater catfish steak",
    "pipoca": "fluffy popped white popcorn pile",
    "pitanga": "glossy bright red ribbed Surinam cherries (pitanga)",
    "polvilho": "fine snow-white sweet cassava starch powder mound",
    "porco": "pork",
    "porquinho": "fresh whole triggerfish",
    "presunto": "folded thin slices of pink cooked ham",
    "pera": "ripe juicy pear",
    "pessego": "ripe fuzzy golden-blush peach",
    "queijo": "cheese",
    "quiabo": "fresh green okra pods",
    "rabanete": "crisp red radishes with white tips",
    "repolho": "fresh round cabbage head cut in half",
    "refrigerante": "fizzy soda drink in a small clear glass",
    "roma": "deep red pomegranate cut open showing ruby seeds",
    "rucula": "fresh green peppery arugula leaves",
    "sal": "clean white salt crystals pile",
    "salame": "thinly sliced cured Italian salami",
    "salmao": "fresh pink-orange salmon fillet",
    "salsa": "fresh curly green parsley sprig",
    "sardinha": "silver sardines",
    "seleta de legumes": "drained colorful diced carrots, green peas, and sweet corn",
    "serralha": "fresh green toothed sowthistle leaves",
    "soja": "soy",
    "taioba": "large heart-shaped green taro leaves",
    "tamarindo": "brown tamarind pods with sticky brown pulp",
    "tangerina": "bright orange ponkan tangerine",
    "tilapia": "white tilapia fish",
    "tomate": "ripe red tomato",
    "torrada": "crispy golden sliced French bread toast",
    "toucinho": "pork belly fatback cubes",
    "tremoco": "yellow flat lupini beans",
    "tucuma": "bright orange oval Amazonian tucuma palm fruit, one halved",
    "tucunare": "white freshwater peacock bass fish fillet",
    "umbu": "small round yellow-green tropical umbu fruits",
    "uva": "fresh grape cluster",
    "vagem": "fresh crisp green beans",
    "pao": "bread",
}

# Qualificadores CONTEXTO-DEPENDENTES: só aplicam para o alimento base exato!
CONTEXT_QUALS: dict[tuple[str, str], str] = {
    ("mexerica", "rio"): "small aromatic green-orange tangerine",
    ("mexerica", "murcote"): "smooth deep-orange honey tangerine",
    ("tangerina", "ponca"): "peeled bright orange ponkan tangerine",
    ("laranja", "da terra"): "textured bitter Seville",
    ("laranja", "baia"): "bright navel",
    ("laranja", "lima"): "pale sweet",
    ("laranja", "pera"): "smooth juicy",
    ("laranja", "valencia"): "bright Valencia",
    ("banana", "da terra"): "large starchy plantain",
    ("banana", "prata"): "sweet yellow",
    ("banana", "nanica"): "curved sweet yellow",
    ("banana", "maca"): "small aromatic yellow",
    ("banana", "ouro"): "miniature golden",
    ("limao", "tahiti"): "glossy green",
    ("limao", "cravo"): "bright orange-skinned rangpur lime halved",
    ("limao", "galego"): "small round yellow-green key lime",
    ("tomate", "extrato"): "thick deep-red concentrated tomato paste in a small white ramekin",
    ("tomate", "pure"): "smooth red tomato puree in a small white ramekin",
    ("tomate", "salada"): "fresh sliced red salad",
    ("tomate", "molho industrializado"): "smooth rich red tomato sauce in a small white ramekin",
    ("oleo", "de milho"): "pale-golden corn",
    ("farinha", "de milho"): "yellow cornmeal",
    ("pao", "de milho"): "golden cornmeal",
    ("bolo", "aipim"): "moist cassava cake",
    ("abobrinha", "italiana"): "green zucchini",
    ("abobrinha", "paulista"): "pale green zucchini",
    ("abobora", "moranga"): "ribbed orange pumpkin wedges",
    ("abobora", "menina brasileira"): "orange-green squash",
    ("abobora", "pescoco"): "butternut neck pumpkin",
    ("batata", "baroa"): "yellow arracacha root",
    ("batata", "doce"): "sweet",
    ("batata", "inglesa"): "white",
    ("alface", "americana"): "crisp iceberg",
    ("alface", "crespa"): "curly green leaf",
    ("alface", "lisa"): "tender butterhead",
    ("feijao", "carioca"): "speckled beige pinto",
    ("feijao", "fradinho"): "black-eyed",
    ("feijao", "jalo"): "large tan pinto",
    ("feijao", "rajado"): "speckled pink-tan",
    ("feijao", "rosinha"): "small pinkish",
    ("feijao", "broto"): "crisp white mung bean sprouts",
    ("uva", "italia"): "translucent green",
    ("uva", "rubi"): "deep ruby red",
    ("mamao", "formosa"): "large red-orange",
    ("mamao", "papaia"): "sweet halved papaya showing orange flesh and black seeds",
    ("manga", "haden"): "blushed red-and-yellow",
    ("manga", "palmer"): "smooth red-purple",
    ("manga", "tommy atkins"): "red-and-green",
    ("maca", "fuji"): "red-and-yellow striped Fuji",
    ("maca", "argentina"): "deep red",
    ("pera", "williams"): "golden-green Bartlett",
    ("pera", "park"): "russet brown-green",
    ("pessego", "aurora"): "golden yellow",
    ("camarao", "sete barbas"): "small",
    ("camarao", "rio grande"): "large marine",
    ("queijo", "minas"): "fresh white Brazilian Minas cheese wheel",
    ("queijo", "frescal"): "soft fresh white",
    ("queijo", "meia cura"): "semi-cured pale yellow",
    ("queijo", "mozarela"): "sliced pale mozzarella",
    ("queijo", "parmesao"): "aged hard parmesan wedge",
    ("queijo", "pasteurizado"): "smooth creamy processed spreadable",
    ("queijo", "petit suisse"): "smooth pink strawberry yogurt cup",
    ("queijo", "prato"): "sliced golden Brazilian prato cheese",
    ("queijo", "ricota"): "crumbly fresh white ricotta cheese wedge",
    ("soja", "farinha"): "fine pale beige soy flour mound",
}

# Qualificadores SEGUROS (sem ambiguidade entre categorias)
SAFE_GLOBAL_QUALS: dict[str, str] = {
    # Cortes bovinos/suínos/frango
    "acem": "beef chuck",
    "bovina": "beef",
    "almondegas": "meatballs",
    "bucho": "beef tripe",
    "capa de contra-file": "ribeye cap steak",
    "charque": "cured jerked beef",
    "contra-file de costela": "bone-in ribeye steak",
    "contra-file": "striploin steak",
    "costela": "ribs",
    "coxao duro": "outside flat beef round",
    "coxao mole": "topside beef round",
    "cupim": "braised beef hump cut",
    "file mingnon": "filet mignon tenderloin",
    "file mignon": "filet mignon tenderloin",
    "flanco": "flank steak",
    "fraldinha": "beef flap bavette steak",
    "figado": "liver slices",
    "lagarto": "eye of round beef",
    "lingua": "sliced beef tongue",
    "maminha": "tri-tip beef roast",
    "miolo de alcatra": "center-cut top sirloin steak",
    "musculo": "beef shank meat",
    "paleta": "shoulder clod beef",
    "patinho": "lean knuckle round steak",
    "peito": "breast",
    "picanha": "picanha rump cap steak",
    "seca": "shredded cured dried beef",
    "asa": "wings",
    "caipira": "free-range",
    "coracao": "hearts",
    "coxa": "drumsticks",
    "sobrecoxa": "thighs",
    "bisteca": "pork chop",
    "lombo": "pork loin",
    "orelha": "salted pork ear",
    "pernil": "pork leg roast",
    "rabo": "salted pork tail",
    "file": "fillet",
    "posta": "thick fish steak",
    "inteira": "whole",
    "inteiro": "whole",
    "sem cabeca": "headless",
    "com pele": "skin-on",
    "sem pele": "skinless",
    "com gordura": "with fat cap",
    "sem gordura": "lean trimmed",
    "com capa de gordura": "with fat edge",
    "sem capa de gordura": "lean trimmed",
    # Preparos
    "cru": "fresh raw",
    "crua": "fresh raw",
    "crus": "fresh raw",
    "cruas": "fresh raw",
    "cozido": "cooked boiled",
    "cozida": "cooked boiled",
    "cozida/10minutos": "hard-boiled",
    "frito": "golden crispy fried",
    "frita": "golden crispy fried",
    "fritas": "golden crispy fried",
    "grelhado": "char-grilled with grill marks",
    "grelhada": "char-grilled with grill marks",
    "assado": "golden oven-roasted",
    "assada": "golden oven-roasted",
    "refogado": "lightly sauteed with herbs",
    "refogada": "lightly sauteed with herbs",
    "moido": "ground",
    "desfiado": "shredded",
    "desfiada": "shredded",
    "a milanesa": "crispy golden breaded",
    "saute": "golden pan-sauteed with parsley",
    "molho escabeche": "in spiced escabeche tomato-vinegar sauce",
    "tipo chips": "thin crispy potato chips",
    "conserva em oleo": "drained flaked in oil",
    "em conserva": "preserved",
    "em calda": "in light glossy syrup",
    "calda": "in light glossy syrup",
    "polpa": "smooth fruit puree",
    "congelada": "chilled",
    "congelado": "fresh",
    "suco": "fresh juice in a small clear glass",
    "suco concentrado": "rich concentrated juice in a small clear glass",
    "fresco": "fresh",
    "fresca": "fresh",
    "flocos": "flakes",
    "enlatada": "preserved",
    "enlatado": "preserved",
    "drenado": "drained",
    "drenada": "drained",
    "conserva": "preserved",
    "envasado": "bottled",
    "sabor abacaxi": "pineapple-flavored yellow",
    "sabor morango": "strawberry-flavored pink",
    "sabor pessego": "peach-flavored soft orange",
    "erva-doce": "fennel",
    "infusao 5%": "clear brewed herbal tea in a small clear glass",
    "infusao 10%": "dark brewed espresso-style black coffee in a small clear cup",
    "com casca": "unpeeled",
    "sem sal": "unsalted",
    "dietetico": "sugar-free",
    "massa fresca": "fresh pasta",
    "oleo hidrogenado": "",
    "oleo interesterificado": "",
    "oleo de soja": "",
    "torrado": "roasted",
    "torrada": "roasted",
    "salgado": "salted",
    "salgada": "salted",
    "desidratadas": "dried flakes",
    "roxa": "purple-red",
    "roxo": "purple",
    "branco": "white",
    "branca": "white",
    "vermelho": "bright red",
    "vermelha": "red-fleshed",
    "amarelo": "bright yellow",
    "amarela": "bright yellow",
    "verde": "green",
    "preto": "black",
    "preta": "black",
    "tipo 1": "white polished",
    "tipo 2": "white",
    "integral": "whole-grain brown",
    "frances": "crusty French bread roll (pao frances)",
    "forma": "sliced sandwich loaf",
    "sovado": "soft golden sweet-style white bread loaf",
    "aveia": "oat",
    "de soja": "soy",
    "gluten": "light wheat gluten",
    "maisena": "crisp rectangular cornstarch tea biscuits",
    "recheado com chocolate": "chocolate cream sandwich cookies",
    "recheado com morango": "strawberry cream sandwich cookies",
    "wafer": "crispy layered wafer biscuits",
    "cream cracker": "square golden salted cream cracker biscuits",
    "pronto": "baked homemade",
    "mistura para": "dry cake mix powder mound",
    "de arroz": "rice",
    "de centeio": "rye",
    "de mandioca": "cassava",
    "de puba": "fermented cassava",
    "de rosca": "golden breadcrumb",
    "de trigo": "wheat",
    "lactea": "creamy infant milk cereal",
    "cristal": "coarse sparkling white crystal",
    "mascavo": "dark moist brown muscovado",
    "refinado": "fine snow-white",
    "ao leite": "smooth milk",
    "meio amargo": "rich dark",
    "natural": "plain",
    "desnatado": "skim",
    "condensado": "thick glossy sweetened condensed milk in a small white bowl",
    "fermentado": "probiotic fermented milk drink in a small white bottle",
    "achocolatado": "chocolate milk in a clear glass",
    "de vaca": "cow",
    "de cabra": "goat",
    "de coco": "creamy white coconut",
    "de dende": "vibrant red-orange African palm oil in a small clear bowl",
    "de oliva": "extra virgin olive",
    "de babacu": "clear pale babassu oil in a small clear bowl",
    "de canola": "pale yellow canola oil",
    "de girassol": "golden sunflower oil",
    "de pequi": "golden-orange pequi oil in a small clear bowl",
    "de mesocarpo de babacu": "light brown babassu mesocarp flour mound",
    "de abelha": "pure golden bee",
    "tipo cola": "dark caramel cola soda with bubbles",
    "tipo guarana": "amber sparkling guarana soda with bubbles",
    "tipo laranja": "bright orange sparkling orange soda",
    "tipo limao": "clear sparkling lemon-lime soda",
    "tipo agua tonica": "crystal clear tonic water with tiny bubbles",
    "po": "fine powder mound",
    "semente": "seeds pile",
    "grao": "raw kernels pile",
}

# Apenas palavras simples 100% seguras para fallback token-a-token
SAFE_WORD_FALLBACK: dict[str, str] = {
    "cru": "fresh raw",
    "crua": "fresh raw",
    "cozido": "cooked",
    "cozida": "cooked",
    "assado": "oven-roasted",
    "assada": "oven-roasted",
    "grelhado": "char-grilled",
    "grelhada": "char-grilled",
    "frito": "golden fried",
    "frita": "golden fried",
    "refogado": "sauteed",
    "refogada": "sauteed",
    "moido": "ground",
    "desfiado": "shredded",
    "integral": "whole-grain",
    "grande": "large",
    "pequeno": "small",
    "branco": "white",
    "branca": "white",
    "preto": "black",
    "preta": "black",
    "verde": "green",
    "vermelho": "red",
    "vermelha": "red",
    "amarelo": "yellow",
    "amarela": "yellow",
    "roxo": "purple",
    "roxa": "purple",
    "torrado": "roasted",
    "torrada": "roasted",
    "salgado": "salted",
    "salgada": "salted",
    "fresco": "fresh",
    "fresca": "fresh",
    "congelado": "chilled",
    "congelada": "chilled",
    "fatiado": "sliced",
    "fatiada": "sliced",
    "drenado": "drained",
    "drenada": "drained",
}


def describe_food(nome: str, categoria: str = "") -> str:
    """Converte o nome do alimento (PT-BR) em descrição visual objetiva em inglês sem colisões."""
    key = _norm(nome)
    if key in EXACT_OVERRIDES:
        return EXACT_OVERRIDES[key]

    stripped = _norm(_strip_parens(nome))
    if stripped and stripped in EXACT_OVERRIDES:
        return EXACT_OVERRIDES[stripped]

    cat_norm = _norm(categoria)

    # Regras contextuais por categoria + palavra inteira (resolve Pacote Clínico e TBCA/POF)
    if contextual := _match_clinical_and_tbca_rules(stripped or key, cat_norm):
        return contextual

    parts = [p.strip() for p in _strip_parens(nome).split(",") if p.strip()]
    base_raw = re.sub(r"\d+([.,]\d+)?\s*%", "", parts[0]).strip() or parts[0]
    base_key = _norm(base_raw)
    base_en = BASE_PT_EN.get(base_key, base_raw)

    quals_norm = [_norm(re.sub(r"\d+([.,]\d+)?\s*%", "", p)) for p in parts[1:]]

    # Ajustes específicos por combinação base + qualificador
    if base_key == "carne" and any(q in SAFE_GLOBAL_QUALS for q in quals_norm):
        base_en = ""  # corte bovino já traz 'beef'
    if base_key == "banana" and "doce em barra" in quals_norm:
        return "square block of dark reddish-brown solid Brazilian banana fudge candy (bananada)"
    if base_key == "goiaba" and any("doce" in q for q in quals_norm):
        return "firm ruby-red slice of Brazilian guava paste (goiabada)"
    if base_key == "leite" and "integral" in quals_norm and "po" in quals_norm:
        return "creamy fine off-white whole milk powder mound"
    if base_key == "leite" and "desnatado" in quals_norm and "po" in quals_norm:
        return "fine white skim milk powder mound"
    if base_key == "leite" and ("integral" in quals_norm or "uht" in quals_norm or "de cabra" in quals_norm):
        return "fresh white milk in a small clean clear glass"

    qual_en: list[str] = []
    for p in parts[1:]:
        qn = _norm(re.sub(r"\d+([.,]\d+)?\s*%", "", p))
        if not qn or qn in {"tradicional", "variados", "sabores variados", "sabor", "pre-cozida"}:
            continue
        if (base_key, qn) in CONTEXT_QUALS:
            qual_en.append(CONTEXT_QUALS[(base_key, qn)])
        elif qn in SAFE_GLOBAL_QUALS:
            val = SAFE_GLOBAL_QUALS[qn]
            if val:
                qual_en.append(val)
        else:
            # Fallback seguro: só traduz palavras que existam em SAFE_WORD_FALLBACK (sem colisões de marca/região)
            words = [
                SAFE_WORD_FALLBACK[w]
                for w in qn.split()
                if w in SAFE_WORD_FALLBACK
            ]
            if words:
                qual_en.append(" ".join(words))

    desc = " ".join(x for x in [*qual_en, base_en] if x).strip()
    return re.sub(r"\s+", " ", desc)


def build_prompt(nome: str, categoria: str = "") -> str:
    """Prompt fixo de fotografia macro de estúdio em fundo branco sólido."""
    subject = describe_food(nome, categoria)
    return (
        f"Studio macro food photography of {subject}, centered single subject, "
        "isolated on a pure solid seamless white background, soft natural studio lighting, "
        "crisp natural textures, realistic colors, sharp focus, square composition, "
        "no text, no labels, no illustration, no people, no cutlery or distracting props."
    )
