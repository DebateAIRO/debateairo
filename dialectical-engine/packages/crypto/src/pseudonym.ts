import { randomInt } from "node:crypto";

/*
 * Public handles for new accounts: an adjective and a noun, each capitalised,
 * then a two-digit number — e.g. "BrightOtter42". Letters and digits only, at
 * most 20 characters.
 *
 * The words are curated, not random dictionary picks: every word is lowercase
 * a-z, 3 to 9 letters, neutral or kind, and sits in exactly one pool. Words
 * that read as an insult, sexual, violent, or a pointer at a group of people
 * once paired with another word are left out (tests/unit/pseudonym.test.ts
 * holds the deny lists). The handle is drawn at random and never derived from
 * the user's email, name or anything else they typed.
 */

export const PSEUDONYM_ADJECTIVES: readonly string[] = Object.freeze([
  "able", "abundant", "active", "adept", "adroit", "affable", "agile", "airy",
  "alert", "alpine", "amber", "amiable", "ample", "ancient", "apt", "arcane",
  "arctic", "ardent", "artful", "assured", "astral", "atomic", "attentive", "august",
  "autumnal", "avid", "azure", "balanced", "balmy", "beaming", "blazing", "blissful",
  "blithe", "blooming", "blue", "bonny", "boundless", "bouncy", "bountiful", "brainy",
  "brave", "breezy", "bright", "brilliant", "brisk", "bronze", "bubbly", "buoyant",
  "busy", "calm", "candid", "canny", "capable", "carefree", "careful", "caring",
  "celestial", "central", "certain", "charming", "cheerful", "cheery", "chipper", "choice",
  "civic", "civil", "classic", "classy", "clean", "clear", "clement", "clever",
  "cloudy", "coastal", "cobalt", "coral", "cordial", "cosmic", "courtly", "cozy",
  "crafty", "crimson", "crisp", "crystal", "cultured", "curious", "cyan", "dainty",
  "dandy", "dapper", "daring", "dashing", "dazzling", "decent", "decisive", "deft",
  "deluxe", "devoted", "dewy", "dexterous", "dignified", "diligent", "direct", "discreet",
  "dreamy", "driven", "dulcet", "dutiful", "dynamic", "eager", "early", "earnest",
  "earthy", "easygoing", "eclectic", "effective", "elated", "electric", "elegant",
  "elfin", "elite", "eloquent", "emerald", "eminent", "enchanted", "endearing", "endless",
  "enduring", "energetic", "epic", "equal", "ethical", "even", "evergreen", "exact",
  "exalted", "expansive", "expert", "fabled", "fabulous", "fair", "faithful", "famed",
  "famous", "fanciful", "fancy", "fearless", "feathery", "fervent", "festive", "fiery",
  "fine", "firm", "first", "fit", "flawless", "fleecy", "fleet", "floral",
  "flowing", "fluent", "fluffy", "flying", "focused", "fond", "formal", "fortunate",
  "frank", "free", "fresh", "friendly", "frosty", "frugal", "gallant", "gentle",
  "genuine", "giant", "gifted", "giving", "glacial", "glad", "glassy", "gleaming",
  "glorious", "glowing", "golden", "good", "gorgeous", "graceful", "gracious", "grand",
  "grassy", "grateful", "great", "green", "groovy", "grounded", "hale", "handy",
  "happy", "hardy", "hearty", "helpful", "heroic", "honest", "honeyed", "hopeful",
  "humble", "hushed", "icy", "iconic", "ideal", "idyllic", "immense", "indigo",
  "inspired", "intrepid", "ivory", "jade", "jaunty", "jazzy", "jeweled", "jolly",
  "jovial", "joyful", "joyous", "jubilant", "just", "keen", "kind", "kindly",
  "kinetic", "lavish", "lawful", "leading", "leafy", "learned", "legendary", "level",
  "light", "limber", "limitless", "linear", "lithe", "little", "lively", "local",
  "lofty", "logical", "loyal", "lucent", "lucid", "lucky", "luminous", "lunar",
  "lush", "lustrous", "lyrical", "magic", "magnetic", "majestic", "marine", "marvelous",
  "measured", "mellow", "melodious", "merciful", "merry", "metallic", "mighty", "mild",
  "mindful", "minty", "mirthful", "misty", "mobile", "modern", "modest", "moonlit",
  "mossy", "motley", "musical", "mystic", "natural", "nautical", "neat", "nifty",
  "nimble", "noble", "northern", "notable", "novel", "oaken", "oceanic",
  "optimal", "orbital", "orderly", "organic", "ornate", "outgoing", "pastel",
  "patient", "peaceful", "peachy", "pearly", "peppy", "perennial", "perky", "placid",
  "plain", "playful", "pleasant", "plentiful", "plucky", "plush", "poetic", "poised",
  "polar", "polished", "polite", "popular", "practical", "precise", "premium", "prime",
  "pristine", "prized", "prompt", "proper", "proud", "prudent", "pure", "quaint",
  "quick", "quiet", "quirky", "radiant", "rainy", "rapid", "rare", "rational",
  "ready", "refined", "regal", "reliable", "resolute", "restful", "rested", "rhythmic",
  "roaming", "robust", "rocky", "rosy", "rousing", "royal", "ruby", "rugged",
  "rustic", "sage", "sandy", "savvy", "scarlet", "scenic", "scholarly", "seasoned",
  "secure", "sensible", "serene", "sharp", "shimmery", "shiny", "silent", "silken",
  "silky", "silver", "simple", "sincere", "sleek", "smart", "smooth", "snappy",
  "snowy", "snug", "soaring", "social", "soft", "solar", "solid", "sonic",
  "sound", "sparkly", "speedy", "spirited", "splendid", "spotless", "spry", "stable",
  "starry", "stately", "steadfast", "steady", "stellar", "sterling", "stoic", "stormy",
  "strong", "sturdy", "sublime", "subtle", "summery", "sunlit", "sunny", "super",
  "superb", "supreme", "sure", "sweet", "swift", "tactful", "tawny", "teal",
  "tender", "thankful", "thrifty", "thriving", "tidal", "tidy", "timeless", "timely",
  "tiny", "tireless", "toasty", "tough", "tranquil", "trim", "tropical", "true",
  "trusted", "trusty", "tuneful", "unique", "united", "upbeat", "upright", "urban",
  "useful", "valiant", "valid", "vast", "velvet", "verdant", "vernal", "vibrant",
  "vigilant", "vintage", "violet", "vital", "vivid", "vocal", "wandering", "warm",
  "wavy", "whimsical", "wild", "windy", "winged", "winsome", "wintry", "wise",
  "witty", "wondrous", "woody", "worthy", "zany", "zealous", "zesty", "zippy"
]);

export const PSEUDONYM_NOUNS: readonly string[] = Object.freeze([
  // Animals.
  "aardvark", "albatross", "alpaca", "anteater", "antelope", "armadillo", "axolotl", "badger",
  "barracuda", "beagle", "bear", "beetle", "bison", "bluebird", "bluejay", "bobcat",
  "bongo", "buffalo", "bulldog", "bunny", "butterfly", "camel", "canary", "capybara",
  "caracal", "caribou", "cassowary", "catfish", "cheetah", "chickadee", "chipmunk", "cicada",
  "clam", "collie", "condor", "cormorant", "coyote", "crab", "crane", "cricket",
  "curlew", "dingo", "dolphin", "dormouse", "dove", "dragonfly", "duck", "dugong",
  "eagle", "egret", "eider", "elk", "emu", "ermine", "falcon", "ferret",
  "finch", "firefly", "flamingo", "flounder", "fox", "gazelle", "gecko", "gerbil",
  "giraffe", "gnu", "goldfinch", "goose", "gopher", "grouse", "gull", "hamster",
  "hare", "harrier", "hawk", "hedgehog", "heron", "hippo", "horse", "husky",
  "ibex", "ibis", "iguana", "impala", "jackdaw", "jaguar", "jay", "jellyfish",
  "kestrel", "kiwi", "koala", "koi", "krill", "ladybug", "lark", "leopard",
  "limpet", "linnet", "lion", "lizard", "llama", "lobster", "lynx", "macaw",
  "magpie", "mallard", "manatee", "mantis", "marlin", "marmot", "marten", "meerkat",
  "merlin", "mink", "minnow", "mongoose", "moose", "moth", "mustang", "narwhal",
  "newt", "nightjar", "numbat", "ocelot", "octopus", "okapi", "orca", "oriole",
  "osprey", "ostrich", "otter", "owl", "oyster", "panda", "panther", "parrot",
  "partridge", "pelican", "penguin", "petrel", "pheasant", "pigeon", "pika", "plover",
  "platypus", "pony", "poodle", "porpoise", "possum", "puffin", "puma", "quail",
  "quokka", "quoll", "rabbit", "raven", "reindeer", "robin", "salmon", "sandpiper",
  "sardine", "scallop", "seahorse", "seal", "shrimp", "skylark", "sparrow", "squid",
  "squirrel", "starling", "stingray", "stork", "sturgeon", "swan", "tapir", "tarpon",
  "tern", "terrier", "thrush", "tiger", "toucan", "trout", "tuna", "turtle",
  "unicorn", "urchin", "vicuna", "vole", "wallaby", "walrus", "warbler", "whale",
  "whippet", "wildcat", "wolf", "wombat", "wren", "yak", "zebra",
  // Trees, plants and flowers.
  "acacia", "acorn", "alder", "almond", "aloe", "amaryllis", "anemone", "apple",
  "apricot", "aspen", "aster", "azalea", "bamboo", "banyan", "basil", "beech",
  "begonia", "birch", "bluebell", "bonsai", "bramble", "briar", "buttercup", "cactus",
  "camellia", "cedar", "chestnut", "clover", "cypress", "daffodil", "dahlia", "daisy",
  "elm", "fennel", "fern", "fig", "fir", "foxglove", "freesia", "gardenia",
  "ginkgo", "hawthorn", "hazel", "heather", "hibiscus", "holly", "iris", "ivy",
  "jasmine", "juniper", "kale", "laurel", "lavender", "lemon", "lilac", "lily",
  "lime", "linden", "lotus", "magnolia", "mango", "maple", "marigold", "mimosa",
  "mint", "mistletoe", "moss", "myrtle", "nutmeg", "oak", "olive", "orchid",
  "oregano", "palm", "papaya", "parsley", "peach", "pear", "pecan", "peony",
  "pepper", "petunia", "pine", "plum", "poplar", "poppy", "primrose", "quince",
  "reed", "rose", "rosemary", "rowan", "saffron", "sequoia", "sorrel", "spruce",
  "sumac", "sunflower", "sycamore", "tamarind", "tansy", "thistle", "thyme", "tulip",
  "vanilla", "verbena", "walnut", "willow", "wisteria", "yarrow", "yew", "zinnia",
  // Land and water.
  "atoll", "bay", "beach", "boulder", "brook", "butte", "canyon", "cape",
  "cascade", "cavern", "cliff", "coast", "cove", "crater", "creek", "delta",
  "dune", "estuary", "fjord", "forest", "geyser", "glacier", "glade", "glen",
  "grove", "gulf", "harbor", "heath", "highland", "hill", "hollow", "island",
  "isle", "islet", "lagoon", "lake", "marsh", "meadow", "mesa", "moor",
  "oasis", "ocean", "orchard", "pasture", "peak", "pebble", "plateau", "pond",
  "prairie", "rapids", "reef", "ridge", "river", "savanna", "shore", "spring",
  "steppe", "stream", "summit", "tide", "tundra", "valley", "volcano", "waterfall",
  "wetland",
  // Sky and weather.
  "aurora", "blizzard", "breeze", "cloud", "comet", "cosmos", "dawn", "dusk",
  "eclipse", "equinox", "frost", "galaxy", "gale", "horizon", "meteor", "mist",
  "monsoon", "moon", "nebula", "nova", "orbit", "planet", "pulsar", "quasar",
  "rain", "rainbow", "sky", "snow", "solstice", "star", "starlight", "storm",
  "sun", "sunbeam", "sunrise", "sunset", "thunder", "twilight", "vortex", "zenith",
  "zephyr",
  // Stones and metals.
  "agate", "amethyst", "basalt", "beryl", "copper", "diamond", "garnet", "granite",
  "graphite", "jasper", "marble", "mica", "obsidian", "onyx", "opal", "pearl",
  "pewter", "quartz", "sapphire", "slate", "topaz", "zircon",
  // Music.
  "accordion", "banjo", "bell", "cello", "chime", "clarinet", "cornet", "cymbal",
  "drum", "fiddle", "flute", "guitar", "harp", "mandolin", "oboe",
  "piano", "trumpet", "tuba", "ukulele", "violin", "whistle", "melody", "rhythm",
  "harmony", "tempo", "chorus", "sonnet", "ballad", "verse",
  // Things made and kept.
  "abacus", "anchor", "anvil", "arch", "atlas", "badge", "bagel", "balloon",
  "banner", "barrel", "basket", "beacon", "bicycle", "biscuit", "blanket", "bonnet",
  "bridge", "bubble", "bucket", "button", "cabin", "candle", "canoe", "canvas",
  "carousel", "castle", "chalk", "chariot", "citadel", "clock", "compass", "cookie",
  "cottage", "crayon", "crown", "cupcake", "easel", "ember", "engine", "feather",
  "fountain", "gadget", "garden", "gazebo", "glider", "globe", "gondola", "hammock",
  "hive", "igloo", "jigsaw", "journal", "kayak", "kettle", "kite", "ladder",
  "lantern", "lasso", "locket", "magnet", "mitten", "mosaic", "muffin", "noodle",
  "paddle", "palette", "parasol", "pencil", "pickle", "pillow", "pinwheel", "pixel",
  "pocket", "prism", "pretzel", "pudding", "puzzle", "quill", "quilt", "radar",
  "raft", "ribbon", "rocket", "saddle", "sail", "satchel", "scroll",
  "signal", "sleigh", "spindle", "spool", "sprocket", "statue", "teacup", "teapot",
  "telescope", "ticket", "toffee", "torch", "tower", "tugboat", "tunnel", "turbine",
  "umbrella", "vessel", "waffle", "wagon", "windmill", "yacht", "zipper",
  // Ideas and journeys.
  "echo", "fable", "legend", "riddle", "saga", "quest", "voyage", "journey",
  "spark", "ripple", "cipher", "origin", "paradox", "theorem", "axiom", "insight",
  // People who think, roam and make.
  "pilot", "ranger", "scout", "sailor", "nomad", "voyager", "wanderer", "dreamer",
  "thinker", "seeker", "scholar", "poet", "bard", "artisan", "orator", "builder",
  "keeper", "maker", "pioneer", "navigator", "inventor", "mentor", "skipper"
]);

/** The two-digit number appended to every handle: 10 through 99. */
const NUMBER_FLOOR = 10;
const NUMBER_SPAN = 90;

/**
 * Draws a fresh random handle. `pick(max)` must return an integer in
 * [0, max); it defaults to the CSPRNG and exists only so tests can pin a draw.
 */
export function generatePseudonym(pick: (max: number) => number = (max) => randomInt(max)): string {
  const adjective = PSEUDONYM_ADJECTIVES[pick(PSEUDONYM_ADJECTIVES.length)]!;
  const noun = PSEUDONYM_NOUNS[pick(PSEUDONYM_NOUNS.length)]!;
  const number = NUMBER_FLOOR + pick(NUMBER_SPAN);
  return `${capitalise(adjective)}${capitalise(noun)}${number}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
