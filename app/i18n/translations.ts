export type Language = 'pt' | 'en';

const pt = {
  'loading': 'Carregando...',

  'onboarding.subtitle': 'Monitore suas alergias alimentares',
  'onboarding.step1.title': 'Olá! Qual é o seu nome?',
  'onboarding.step1.subtitle': 'Vamos personalizar seu perfil de alergias.',
  'onboarding.name.label': 'Nome completo',
  'onboarding.name.placeholder': 'Ex: Maria Silva',
  'onboarding.name.error': 'Por favor, insira seu nome.',
  'onboarding.next': 'Próximo →',
  'onboarding.step2.title': 'Quais são suas alergias?',
  'onboarding.step2.subtitle': 'Selecione todas que se aplicam. Você pode editar isso depois.',
  'onboarding.allergy.placeholder': 'Outra alergia...',
  'onboarding.allergy.add': '+ Adicionar',
  'onboarding.back': '← Voltar',
  'onboarding.start': 'Começar 🎉',
  'onboarding.noAllergies': 'Sem alergias conhecidas? Tudo bem, você pode pular.',

  'header.hello': 'Olá,',
  'header.signOut': 'Sair',

  'tab.home': 'Início',
  'tab.meals': 'Refeições',
  'tab.reactions': 'Reações',

  'settings.appearance': 'Aparência',
  'settings.darkMode': 'Modo escuro',
  'settings.lightMode': 'Modo claro',
  'settings.language': 'Idioma',

  'stats.meals': 'Refeições',
  'stats.reactions': 'Reações',
  'stats.allergies': 'Alergias',

  'home.myAllergies': 'Minhas Alergias',
  'home.edit': 'Editar',
  'home.noAllergies': 'Nenhuma alergia cadastrada.',
  'home.today': 'Hoje',
  'home.noMealsToday': 'Nenhuma refeição registrada hoje.',

  'meals.empty.filtered': 'Nenhuma refeição neste dia.',
  'meals.empty.all': 'Nenhuma refeição registrada ainda.',
  'meals.logButton': 'Registrar Refeição',
  'meals.confirmDelete': 'Confirmar exclusão',
  'meals.cancel': 'Cancelar',

  'reactions.empty.filtered': 'Nenhuma reação registrada neste período.',
  'reactions.empty.noMeals': 'Nenhuma refeição neste dia.',
  'reactions.empty.all': 'Nenhuma reação registrada ainda.',
  'reactions.logButton': 'Registrar Reação',
  'reactions.badge': '⚠️ Reação',

  'modal.cancel': 'Cancelar',
  'modal.save': 'Salvar',
  'modal.time': 'Horário',
  'modal.photo': 'Foto',
  'modal.addPhoto': 'Adicionar foto',
  'modal.changePhoto': 'Trocar foto',
  'modal.removePhoto': 'Remover',
  'modal.photoTooLarge': 'Imagem muito grande ({size} MB). Máximo: {max} MB.',
  'modal.edit': 'Editar',
  'modal.editReaction': 'Editar reação',
  'modal.delete': 'Excluir',

  'allergyModal.title': 'Minhas Alergias',
  'allergyModal.placeholder': 'Outra alergia...',
  'allergyModal.add': '+ Adicionar',
  'allergyModal.empty': 'Sem alergias selecionadas — tudo bem!',

  'editMeal.title': 'Editar Refeição',
  'editMeal.mealType': 'Tipo de refeição',
  'editMeal.description': 'Descrição / ingredientes',
  'editMeal.descriptionPlaceholder': 'Ingredientes, observações...',

  'editReaction.title': 'Editar Reação',
  'editReaction.intensity': 'Intensidade',
  'editReaction.symptoms': 'Sintomas',
  'editReaction.notes': 'Descrição dos sintomas',
  'editReaction.notesPlaceholder': 'Descreva como se sentiu, quando os sintomas apareceram...',

  'logReaction.title': 'Registrar Reação',
  'logReaction.context': 'Contexto',
  'logReaction.contextOptional': '(opcional)',
  'logReaction.contextPlaceholder': 'Ex: Após o almoço, Sorvete de baunilha...',
  'logReaction.defaultName': 'Reação registrada',
  'logReaction.register': 'Registrar',

  'log.title': 'Nova Refeição',
  'log.mealType': 'Tipo de refeição',
  'log.mealName': 'Nome da refeição',
  'log.mealNameError': 'Informe o nome da refeição.',
  'log.mealNamePlaceholder': 'Ex: Frango grelhado com arroz',
  'log.description': 'Descrição / ingredientes',
  'log.descriptionPlaceholder': 'Descreva os ingredientes ou detalhes relevantes...',
  'log.photoLabel': 'Foto da refeição',
  'log.photoTap': 'Toque para adicionar foto',
  'log.photoFormat': 'JPG, PNG · Máx. {max} MB',
  'log.photoStorageError': 'Erro ao salvar: armazenamento cheio. Tente sem a foto.',
  'log.reactionQuestion': 'Teve alguma reação?',
  'log.reactionSubtitle': 'Registre se sentiu algum sintoma após comer.',
  'log.symptomsQuestion': 'Quais sintomas?',
  'log.saving': 'Salvando...',
  'log.save': 'Salvar Refeição',

  'meal.cafe-da-manha': 'Café da manhã',
  'meal.lanche-da-manha': 'Lanche da manhã',
  'meal.almoco': 'Almoço',
  'meal.lanche-da-tarde': 'Lanche da tarde',
  'meal.jantar': 'Jantar',
  'meal.lanche-extra': 'Lanche extra',

  'intensity.leve': 'Leve',
  'intensity.moderada': 'Moderada',
  'intensity.grave': 'Grave',

  'allergy.Leite / Lactose': 'Leite / Lactose',
  'allergy.Ovos': 'Ovos',
  'allergy.Amendoim': 'Amendoim',
  'allergy.Nozes e castanhas': 'Nozes e castanhas',
  'allergy.Trigo / Glúten': 'Trigo / Glúten',
  'allergy.Soja': 'Soja',
  'allergy.Peixe': 'Peixe',
  'allergy.Frutos do mar': 'Frutos do mar',
  'allergy.Gergelim': 'Gergelim',

  'symptom.Coceira na pele': 'Coceira na pele',
  'symptom.Urticária': 'Urticária',
  'symptom.Inchaço': 'Inchaço',
  'symptom.Dificuldade para respirar': 'Dificuldade para respirar',
  'symptom.Náusea': 'Náusea',
  'symptom.Dor abdominal': 'Dor abdominal',
  'symptom.Diarreia': 'Diarreia',
  'symptom.Vômitos': 'Vômitos',
  'symptom.Tontura': 'Tontura',

  'day.0': 'Seg',
  'day.1': 'Ter',
  'day.2': 'Qua',
  'day.3': 'Qui',
  'day.4': 'Sex',
  'day.5': 'Sáb',
  'day.6': 'Dom',
};

const en: typeof pt = {
  'loading': 'Loading...',

  'onboarding.subtitle': 'Track your food allergies',
  'onboarding.step1.title': "Hello! What's your name?",
  'onboarding.step1.subtitle': "Let's customize your allergy profile.",
  'onboarding.name.label': 'Full name',
  'onboarding.name.placeholder': 'E.g.: John Smith',
  'onboarding.name.error': 'Please enter your name.',
  'onboarding.next': 'Next →',
  'onboarding.step2.title': 'What are your allergies?',
  'onboarding.step2.subtitle': 'Select all that apply. You can edit this later.',
  'onboarding.allergy.placeholder': 'Other allergy...',
  'onboarding.allergy.add': '+ Add',
  'onboarding.back': '← Back',
  'onboarding.start': 'Start 🎉',
  'onboarding.noAllergies': "No known allergies? That's fine, you can skip.",

  'header.hello': 'Hello,',
  'header.signOut': 'Sign out',

  'tab.home': 'Home',
  'tab.meals': 'Meals',
  'tab.reactions': 'Reactions',

  'settings.appearance': 'Appearance',
  'settings.darkMode': 'Dark mode',
  'settings.lightMode': 'Light mode',
  'settings.language': 'Language',

  'stats.meals': 'Meals',
  'stats.reactions': 'Reactions',
  'stats.allergies': 'Allergies',

  'home.myAllergies': 'My Allergies',
  'home.edit': 'Edit',
  'home.noAllergies': 'No allergies registered.',
  'home.today': 'Today',
  'home.noMealsToday': 'No meals logged today.',

  'meals.empty.filtered': 'No meals on this day.',
  'meals.empty.all': 'No meals logged yet.',
  'meals.logButton': 'Log Meal',
  'meals.confirmDelete': 'Confirm delete',
  'meals.cancel': 'Cancel',

  'reactions.empty.filtered': 'No reactions in this period.',
  'reactions.empty.noMeals': 'No meals on this day.',
  'reactions.empty.all': 'No reactions logged yet.',
  'reactions.logButton': 'Log Reaction',
  'reactions.badge': '⚠️ Reaction',

  'modal.cancel': 'Cancel',
  'modal.save': 'Save',
  'modal.time': 'Time',
  'modal.photo': 'Photo',
  'modal.addPhoto': 'Add photo',
  'modal.changePhoto': 'Change photo',
  'modal.removePhoto': 'Remove',
  'modal.photoTooLarge': 'Image too large ({size} MB). Maximum: {max} MB.',
  'modal.edit': 'Edit',
  'modal.editReaction': 'Edit reaction',
  'modal.delete': 'Delete',

  'allergyModal.title': 'My Allergies',
  'allergyModal.placeholder': 'Other allergy...',
  'allergyModal.add': '+ Add',
  'allergyModal.empty': "No allergies selected — that's fine!",

  'editMeal.title': 'Edit Meal',
  'editMeal.mealType': 'Meal type',
  'editMeal.description': 'Description / ingredients',
  'editMeal.descriptionPlaceholder': 'Ingredients, notes...',

  'editReaction.title': 'Edit Reaction',
  'editReaction.intensity': 'Intensity',
  'editReaction.symptoms': 'Symptoms',
  'editReaction.notes': 'Symptom description',
  'editReaction.notesPlaceholder': 'Describe how you felt, when symptoms appeared...',

  'logReaction.title': 'Log Reaction',
  'logReaction.context': 'Context',
  'logReaction.contextOptional': '(optional)',
  'logReaction.contextPlaceholder': 'E.g.: After lunch, Vanilla ice cream...',
  'logReaction.defaultName': 'Reaction logged',
  'logReaction.register': 'Log',

  'log.title': 'New Meal',
  'log.mealType': 'Meal type',
  'log.mealName': 'Meal name',
  'log.mealNameError': 'Please enter the meal name.',
  'log.mealNamePlaceholder': 'E.g.: Grilled chicken with rice',
  'log.description': 'Description / ingredients',
  'log.descriptionPlaceholder': 'Describe ingredients or relevant details...',
  'log.photoLabel': 'Meal photo',
  'log.photoTap': 'Tap to add photo',
  'log.photoFormat': 'JPG, PNG · Max. {max} MB',
  'log.photoStorageError': 'Error saving: storage full. Try without the photo.',
  'log.reactionQuestion': 'Had any reaction?',
  'log.reactionSubtitle': 'Log if you felt any symptoms after eating.',
  'log.symptomsQuestion': 'Which symptoms?',
  'log.saving': 'Saving...',
  'log.save': 'Save Meal',

  'meal.cafe-da-manha': 'Breakfast',
  'meal.lanche-da-manha': 'Morning Snack',
  'meal.almoco': 'Lunch',
  'meal.lanche-da-tarde': 'Afternoon Snack',
  'meal.jantar': 'Dinner',
  'meal.lanche-extra': 'Extra Snack',

  'intensity.leve': 'Mild',
  'intensity.moderada': 'Moderate',
  'intensity.grave': 'Severe',

  'allergy.Leite / Lactose': 'Milk / Lactose',
  'allergy.Ovos': 'Eggs',
  'allergy.Amendoim': 'Peanuts',
  'allergy.Nozes e castanhas': 'Tree nuts',
  'allergy.Trigo / Glúten': 'Wheat / Gluten',
  'allergy.Soja': 'Soy',
  'allergy.Peixe': 'Fish',
  'allergy.Frutos do mar': 'Shellfish',
  'allergy.Gergelim': 'Sesame',

  'symptom.Coceira na pele': 'Skin itching',
  'symptom.Urticária': 'Hives',
  'symptom.Inchaço': 'Swelling',
  'symptom.Dificuldade para respirar': 'Difficulty breathing',
  'symptom.Náusea': 'Nausea',
  'symptom.Dor abdominal': 'Abdominal pain',
  'symptom.Diarreia': 'Diarrhea',
  'symptom.Vômitos': 'Vomiting',
  'symptom.Tontura': 'Dizziness',

  'day.0': 'Mon',
  'day.1': 'Tue',
  'day.2': 'Wed',
  'day.3': 'Thu',
  'day.4': 'Fri',
  'day.5': 'Sat',
  'day.6': 'Sun',
};

export const translations: Record<Language, typeof pt> = { pt, en };

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

export function createT(language: Language): TFunction {
  const dict = translations[language];
  return function t(key: string, params?: Record<string, string | number>): string {
    const value = dict[key as keyof typeof pt];
    let str: string;
    if (value !== undefined) {
      str = value;
    } else {
      const dotIdx = key.indexOf('.');
      str = dotIdx >= 0 ? key.slice(dotIdx + 1) : key;
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };
}
