"""
Downloads all MCQ data .js files from medmasters.academy with delays
to avoid rate-limiting. Also downloads nts_mock1.js.

Usage:  python download_js.py [base_url]
Example: python download_js.py https://www.medmasters.academy
"""

import os
import sys
import time
import random
import urllib.request
import urllib.error

BASE_URL = (sys.argv[1] if len(sys.argv) > 1
            else 'https://www.medmasters.academy')

DELAY_BETWEEN = (3, 7)        # random delay range in seconds
MAX_RETRIES = 3
OUT_DIR = os.path.join(os.path.dirname(__file__), 'downloaded_js')

# All .js data files referenced in the app
JS_FILES = [
    # Root-level subject data
    'anatomy.js', 'physio.js', 'biochem.js', 'pharma.js',
    'patho.js', 'micro.js', 'community.js', 'behavioral.js',
    'english_vocab.js', 'english_grammar.js', 'english_sentence.js',

    # NTS mock exams
    'nts_mock1.js', 'nts_mock2.js', 'nts_mock3.js', 'nts_mock4.js',
    'nts_mock5.js', 'nts_mock6.js', 'nts_mock7.js', 'nts_mock8.js',
    'nts_mock9.js', 'nts_mock10.js',

    # NTS range practice
    'nts_range_1.js', 'nts_range_2.js', 'nts_range_3.js',

    # Medicine Paper 2
    'med_p2_cvs.js', 'med_p2_derma.js', 'med_p2_hepato.js',
    'med_p2_haemo.js', 'med_p2_cns.js', 'med_p2_gastro.js',
    'med_p2_pulmo.js', 'med_p2_paeds.js', 'med_p2_nephro.js',
    'med_p2_endo.js', 'med_p2_infect.js', 'med_p2_rheuma.js',

    # Surgery Paper 2
    'surg_p2_gen_surg.js', 'surg_p2_ortho.js', 'surg_p2_cardiothor.js',
    'surg_p2_neuro.js', 'surg_p2_genito.js', 'surg_p2_skin.js',
    'surg_p2_paeds.js',

    # Gynae & Obs Paper 2
    'gynae_p2_anatomy.js', 'gynae_p2_physio.js', 'gynae_p2_biochem.js',
    'gynae_p2_pharma.js', 'gynae_p2_antenatal.js', 'gynae_p2_patho.js',
    'gynae_p2_congenital.js', 'gynae_p2_infections.js', 'gynae_p2_biostats.js',

    # ENT Paper 2
    'ent_p2_ext_ear.js', 'ent_p2_mid_ear.js', 'ent_p2_inner_ear.js',
    'ent_p2_ext_nose.js', 'ent_p2_nasal_cavity.js', 'ent_p2_sinuses.js',
    'ent_p2_oral_cavity.js', 'ent_p2_oropharynx.js', 'ent_p2_nasopharynx.js',
    'ent_p2_hypopharynx.js', 'ent_p2_face.js', 'ent_p2_neck.js',
    'ent_p2_thyroid.js', 'ent_p2_salivary.js', 'ent_p2_congenital.js',
    'ent_p2_neck_space.js', 'ent_p2_larynx.js', 'ent_p2_oesophagus.js',

    # Ophthalmology Paper 2
    'oph_p2_ocular_anatomy.js', 'oph_p2_ocular_physio.js',
    'oph_p2_ocular_patho.js', 'oph_p2_ocular_pharma.js',
    'oph_p2_optical_physics.js', 'oph_p2_refraction.js',
    'oph_p2_instruments.js', 'oph_p2_vitreo_retina.js',
    'oph_p2_glaucoma.js', 'oph_p2_lens.js', 'oph_p2_cornea.js',
    'oph_p2_uveal.js', 'oph_p2_neurooph.js', 'oph_p2_eyelid.js',
    'oph_p2_conjunctiva.js', 'oph_p2_orbit.js', 'oph_p2_squint.js',
    'oph_p2_lacrimal.js', 'oph_p2_scleritis.js', 'oph_p2_trauma.js',

    # Radiology Paper 2 (FCPS Radiology subjects)
    'radio_p2_brain_spine.js', 'radio_p2_resp_cvs.js',
    'radio_p2_git_hepato_pancreas.js', 'radio_p2_urinary_adrenal.js',
    'radio_p2_paeds.js', 'radio_p2_bones_joints.js',
    'radio_p2_head_neck.js', 'radio_p2_women_imaging.js',
    'radio_p2_male_pelvis.js', 'radio_p2_nuclear.js',

    # Radiology MedGolden recall batches
    'radio_golden_1_6.js', 'radio_golden_7_12.js',
    'radio_golden_13_18.js', 'radio_golden_19_23.js',
    'radio_golden_24_s1.js', 'radio_golden_24_s2.js',
    'radio_golden_24_s3.js', 'radio_golden_24_s4.js',
    'radio_golden_24_s5.js', 'radio_golden_24_s6.js',
    'radio_golden_24_s7.js', 'radio_golden_24_s8.js',

    # Psychiatry Paper 2
    'psych_p2_neuro.js', 'psych_p2_psych.js',
    'psych_p2_neurosurg.js', 'psych_p2_med.js',
    'psych_p2_child.js', 'psych_p2_behav.js',

    # Anesthesia Paper 2
    'anaes_p2_anatomy.js', 'anaes_p2_physio.js',
    'anaes_p2_pharma.js', 'anaes_p2_physics.js',
    'anaes_p2_patho_liver.js', 'anaes_p2_patho_kidney.js',
    'anaes_p2_patho_resp.js', 'anaes_p2_patho_shock.js',
    'anaes_p2_patho_anaphylaxis.js', 'anaes_p2_patho_trauma.js',
]

# Also download supporting files
SUPPORT_FILES = [
    'main.css',
]


def download_file(filename, dest_dir):
    url = f'{BASE_URL}/{filename}'
    dest_path = os.path.join(dest_dir, filename)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                                   'AppleWebKit/537.36'),
                    'Accept': '*/*',
                    'Referer': f'{BASE_URL}/',
                }
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(data)
            print(f'  OK  {filename}  ({len(data):,} bytes)')
            return True
        except urllib.error.HTTPError as e:
            print(f'  FAIL {filename}  HTTP {e.code}')
            return False
        except Exception as e:
            if attempt < MAX_RETRIES:
                delay = random.uniform(5, 10)
                print(f'  RETRY {filename}  ({e})  waiting {delay:.0f}s...')
                time.sleep(delay)
            else:
                print(f'  FAIL {filename}  ({e})')
                return False


def main():
    print(f'Downloading JS files from {BASE_URL}')
    print(f'Saving to: {OUT_DIR}')
    print(f'Delay between files: {DELAY_BETWEEN[0]}-{DELAY_BETWEEN[1]}s')
    print(f'Max retries per file: {MAX_RETRIES}')
    print()

    os.makedirs(OUT_DIR, exist_ok=True)

    total = len(JS_FILES)
    success = 0

    for i, filename in enumerate(JS_FILES, 1):
        print(f'[{i}/{total}] ', end='')
        if download_file(filename, OUT_DIR):
            success += 1
        if i < total:
            delay = random.uniform(*DELAY_BETWEEN)
            print(f'       waiting {delay:.1f}s...')
            time.sleep(delay)

    # Also download CSS
    for fname in SUPPORT_FILES:
        print(f'[extra] ', end='')
        download_file(fname, OUT_DIR)

    print()
    print(f'Done: {success}/{total} JS files downloaded successfully.')
    print(f'Files saved in: {OUT_DIR}')


if __name__ == '__main__':
    main()
