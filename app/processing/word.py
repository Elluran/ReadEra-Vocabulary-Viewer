import nltk
from nltk.stem import WordNetLemmatizer
from nltk.corpus import wordnet

# Initialize NLTK
try:
    lemmatizer = WordNetLemmatizer()
    # Test if data is available
    lemmatizer.lemmatize("test")
except LookupError:
    print("NLTK data not found. Downloading...")
    nltk.download('wordnet')
    nltk.download('omw-1.4')
    lemmatizer = WordNetLemmatizer()

def get_wordnet_pos(treebank_tag):
    if treebank_tag.startswith('J'):
        return wordnet.ADJ
    elif treebank_tag.startswith('V'):
        return wordnet.VERB
    elif treebank_tag.startswith('N'):
        return wordnet.NOUN
    elif treebank_tag.startswith('R'):
        return wordnet.ADV
    else:
        return wordnet.NOUN

def lemmatize_words(words):
    results = {}
    for word in words:
        w = word.lower()
        # Group verb tenses (flung -> fling)
        v_lemma = lemmatizer.lemmatize(w, pos=wordnet.VERB)
        if v_lemma != w:
            results[word] = v_lemma
        else:
            # Group plurals (cats -> cat)
            n_lemma = lemmatizer.lemmatize(w, pos=wordnet.NOUN)
            results[word] = n_lemma
    return results
