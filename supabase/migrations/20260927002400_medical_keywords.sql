-- Medical device: "treatment" matched hair and skin care far more than medical products. The
-- title keywords are now specific medical words; Amazon's category signals stay the main trigger.
update category_rules
set keywords = array['fungal', 'nail fungus', 'dermatitis', 'eczema', 'psoriasis', 'scar', 'scars', 'wound', 'wounds', 'keratosis', 'haemorrhoid', 'haemorrhoids', 'hemorrhoid', 'hemorrhoids', 'antifungal', 'anti-fungal', 'antiseptic', 'anti-septic', 'medicated']
where key = 'medicalDevice';
